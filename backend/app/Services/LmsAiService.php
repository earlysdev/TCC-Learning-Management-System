<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LmsAiService
{
    /**
     * Extract clean, human-readable text from a raw PDF binary string.
     * Supports FlateDecode streams, ToUnicode CMap hex strings, and literal PDF text blocks,
     * while strictly filtering out any binary/font/compressed stream noise.
     */
    public function extractTextFromPdfBinary(string $pdfBinary): string
    {
        if ($pdfBinary === '') {
            return '';
        }

        $decompressedStreams = [];
        $cmap = [];

        if (preg_match_all('/stream\r?\n(.*?)\r?\nendstream/s', $pdfBinary, $matches)) {
            foreach ($matches[1] as $rawStream) {
                $trimmedStream = ltrim($rawStream, "\r\n");
                $decoded = @gzuncompress($trimmedStream);
                if ($decoded === false) {
                    $decoded = @gzinflate($trimmedStream);
                }
                if ($decoded === false && strlen($trimmedStream) > 2) {
                    $decoded = @gzinflate(substr($trimmedStream, 2));
                }
                // Only accept genuinely uncompressed streams if they contain explicit PDF text operators (BT / ET)
                if ($decoded === false) {
                    if (str_contains($trimmedStream, 'BT') && str_contains($trimmedStream, 'ET')) {
                        $decoded = $trimmedStream;
                    } else {
                        continue;
                    }
                }

                if (! is_string($decoded) || $decoded === '') {
                    continue;
                }

                $decompressedStreams[] = $decoded;

                // Parse ToUnicode CMap mappings if present in this stream
                if (str_contains($decoded, 'beginbfchar')) {
                    if (preg_match_all('/beginbfchar(.*?)endbfchar/s', $decoded, $bfMatches)) {
                        foreach ($bfMatches[1] as $block) {
                            if (preg_match_all('/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/', $block, $pairs, PREG_SET_ORDER)) {
                                foreach ($pairs as $pair) {
                                    $src = strtoupper($pair[1]);
                                    $dstHex = $pair[2];
                                    $char = @hex2bin($dstHex);
                                    if ($char !== false) {
                                        $utf8 = strlen($dstHex) >= 4
                                            ? @mb_convert_encoding($char, 'UTF-8', 'UTF-16BE')
                                            : $char;
                                        if (is_string($utf8) && $utf8 !== '') {
                                            $cmap[$src] = $utf8;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (str_contains($decoded, 'beginbfrange')) {
                    if (preg_match_all('/beginbfrange(.*?)endbfrange/s', $decoded, $rangeMatches)) {
                        foreach ($rangeMatches[1] as $block) {
                            if (preg_match_all('/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/', $block, $ranges, PREG_SET_ORDER)) {
                                foreach ($ranges as $r) {
                                    $start = hexdec($r[1]);
                                    $end = hexdec($r[2]);
                                    $target = hexdec($r[3]);
                                    $width = strlen($r[1]);
                                    if ($end >= $start && ($end - $start) <= 256) {
                                        for ($code = $start; $code <= $end; $code++) {
                                            $keyHex = strtoupper(str_pad(dechex($code), $width, '0', STR_PAD_LEFT));
                                            $uCode = $target + ($code - $start);
                                            if ($uCode >= 32 && $uCode <= 126) {
                                                $cmap[$keyHex] = chr((int) $uCode);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        $chunks = [];
        foreach ($decompressedStreams as $stream) {
            if (str_contains($stream, 'beginbfchar') || str_contains($stream, '/CIDInit')) {
                continue;
            }

            $textBlocks = [];
            if (preg_match_all('/BT\b(.*?)\bET/s', $stream, $btMatches)) {
                $textBlocks = $btMatches[1];
            }

            foreach ($textBlocks as $block) {
                // 1. Extract literal strings (...) inside BT..ET
                if (preg_match_all('/\((?:\\\\.|[^\\\\()])*\)/s', $block, $strMatches)) {
                    $lineParts = [];
                    foreach ($strMatches[0] as $literal) {
                        $inner = substr($literal, 1, -1);
                        $inner = str_replace(
                            ['\\n', '\\r', '\\t', '\\(', '\\)', '\\\\'],
                            [' ', ' ', ' ', '(', ')', '\\'],
                            $inner
                        );
                        $inner = preg_replace_callback('/\\\\([0-7]{1,3})/', fn ($m) => chr(octdec($m[1])), $inner) ?? $inner;
                        $lineParts[] = $inner;
                    }
                    $joined = trim(implode('', $lineParts));
                    if ($joined !== '') {
                        $chunks[] = $joined;
                    }
                }

                // 2. Extract hex strings <...> inside BT..ET using ToUnicode CMap or UTF-16BE
                if (! empty($cmap) && preg_match_all('/<([0-9A-Fa-f]{2,})>/', $block, $hexMatches)) {
                    $decodedHexLine = '';
                    foreach ($hexMatches[1] as $hexStr) {
                        $upperHex = strtoupper($hexStr);
                        $step = isset($cmap[substr($upperHex, 0, 4)]) ? 4 : 2;
                        for ($i = 0; $i < strlen($upperHex); $i += $step) {
                            $token = substr($upperHex, $i, $step);
                            if (isset($cmap[$token])) {
                                $decodedHexLine .= $cmap[$token];
                            }
                        }
                    }
                    if (trim($decodedHexLine) !== '') {
                        $chunks[] = trim($decodedHexLine);
                    }
                }
            }
        }

        $cleanSentences = $this->extractCleanSentences(implode(' ', $chunks));

        return Str::limit(implode(' ', $cleanSentences), 15000, '');
    }

    /**
     * Filter raw text into verified, human-readable English sentences and reject any binary/encoding noise.
     *
     * @return array<int, string>
     */
    public function extractCleanSentences(string $rawText): array
    {
        if (trim($rawText) === '') {
            return [];
        }

        $normalized = preg_replace('/[^\x20-\x7E\r\n]/', ' ', $rawText) ?? '';
        $normalized = preg_replace('/\s+/', ' ', $normalized) ?? '';
        $candidates = preg_split('/(?<=[.?!:;])\s+|\s{2,}/', $normalized) ?: [];

        $clean = [];
        foreach ($candidates as $candidate) {
            $trimmed = trim($candidate);
            if ($this->isCleanReadableSentence($trimmed)) {
                $clean[] = $trimmed;
            }
            if (count($clean) >= 60) {
                break;
            }
        }

        return array_values(array_unique($clean));
    }

    /**
     * Strictly verify that a string is genuine human-readable text and not compressed stream noise.
     */
    public function isCleanReadableSentence(string $text): bool
    {
        $trimmed = trim($text);
        $len = strlen($trimmed);
        if ($len < 25 || $len > 320) {
            return false;
        }

        // Reject strings containing binary/stream noise markers
        if (preg_match('/(\\\\\$|\\\\[A-Za-z0-9]|[|@^~`{}\[\]<>]|obj\b|endobj\b|stream\b|FlateDecode)/', $trimmed)) {
            return false;
        }

        // Require at least 78% of characters to be standard letters, digits, spaces, or normal punctuation
        $lettersAndSpaces = preg_match_all('/[a-zA-Z\s]/', $trimmed);
        if ($lettersAndSpaces < ($len * 0.78)) {
            return false;
        }

        // Check token quality: must have at least 5 real words of 3+ letters, and very few 1-2 char isolated tokens
        $tokens = preg_split('/\s+/', $trimmed) ?: [];
        if (count($tokens) < 5) {
            return false;
        }

        $realWords = 0;
        $noiseTokens = 0;
        foreach ($tokens as $tok) {
            $cleanTok = trim($tok, ".,;:?!()\"'-");
            if ($cleanTok === '') {
                continue;
            }
            if (preg_match('/^[a-zA-Z]{3,}$/', $cleanTok) && preg_match('/[aeiouAEIOU]/', $cleanTok)) {
                $realWords++;
            } elseif (strlen($cleanTok) <= 2 && ! in_array(strtolower($cleanTok), ['a', 'an', 'in', 'on', 'of', 'to', 'is', 'it', 'or', 'by', 'as', 'at', 'be', 'we', 'no', 'so', 'do', 'if', 'up'], true)) {
                $noiseTokens++;
            } elseif (preg_match('/[A-Z].*[a-z].*[A-Z]/', $cleanTok) || preg_match('/[0-9]+[A-Za-z]+[0-9]+/', $cleanTok)) {
                $noiseTokens += 2;
            }
        }

        if ($realWords < 4 || $noiseTokens > max(2, (int) floor(count($tokens) * 0.2))) {
            return false;
        }

        return true;
    }

    /**
     * Detect whether a quiz's existing questions contain legacy binary stream noise so they can be auto-repaired.
     *
     * @param array<int, mixed> $questions
     */
    public function hasCorruptedQuestions(array $questions): bool
    {
        if (empty($questions)) {
            return false;
        }
        foreach ($questions as $q) {
            if (! is_array($q)) {
                continue;
            }
            $prompt = (string) ($q['prompt'] ?? '');
            $firstOption = (string) ($q['options'][0] ?? '');
            if (
                str_contains($prompt, 'which statement accurately reflects the course material?')
                && ! $this->isCleanReadableSentence($firstOption)
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Detect whether a multi-question quiz has every single multiple-choice correct answer stuck on Option A (index 0).
     *
     * @param array<int, mixed> $questions
     */
    public function hasAllAnswersStuckOnFirstOption(array $questions): bool
    {
        $mcCount = 0;
        foreach ($questions as $q) {
            if (! is_array($q)) {
                return false;
            }
            $type = (string) ($q['type'] ?? 'multiple_choice');
            if ($type !== 'multiple_choice') {
                continue;
            }
            $mcCount++;
            if ((int) ($q['correct_index'] ?? 0) !== 0) {
                return false;
            }
        }
        return $mcCount >= 2;
    }

    /**
     * Shuffle the options of each multiple-choice question while keeping the exact real answer as `correct_index`,
     * ensuring the correct answers do not stick to Option A.
     *
     * @param array<int, array<string, mixed>> $questions
     * @return array<int, array<string, mixed>>
     */
    public function randomizeOptionsPreservingCorrectAnswer(array $questions): array
    {
        $randomized = [];
        $usedPositions = [];

        foreach (array_values($questions) as $idx => $q) {
            if (! is_array($q) || empty($q['options']) || ! is_array($q['options'])) {
                $randomized[] = $q;
                continue;
            }

            $type = (string) ($q['type'] ?? 'multiple_choice');
            if ($type !== 'multiple_choice') {
                $randomized[] = $q;
                continue;
            }

            $options = array_values($q['options']);
            $optCount = count($options);
            if ($optCount < 2) {
                $randomized[] = $q;
                continue;
            }

            $currentCorrectIdx = isset($q['correct_index']) && is_numeric($q['correct_index'])
                ? max(0, min($optCount - 1, (int) $q['correct_index']))
                : 0;
            $realAnswerText = $options[$currentCorrectIdx];

            // Remove the real answer, shuffle the distractors, and place the real answer at a random index
            $distractors = [];
            foreach ($options as $i => $opt) {
                if ($i !== $currentCorrectIdx) {
                    $distractors[] = $opt;
                }
            }
            shuffle($distractors);

            $targetPos = random_int(0, $optCount - 1);
            // Avoid repeating the same option letter on consecutive questions or sticking to A
            if ($idx > 0 && isset($usedPositions[$idx - 1]) && $targetPos === $usedPositions[$idx - 1]) {
                $targetPos = ($targetPos + random_int(1, $optCount - 1)) % $optCount;
            }
            if ($idx === 1 && ($usedPositions[0] ?? -1) === 0 && $targetPos === 0) {
                $targetPos = random_int(1, $optCount - 1);
            }

            array_splice($distractors, $targetPos, 0, [$realAnswerText]);
            $newCorrectIdx = array_search($realAnswerText, $distractors, true);

            $q['options'] = array_values($distractors);
            $q['correct_index'] = $newCorrectIdx !== false ? (int) $newCorrectIdx : $targetPos;
            $usedPositions[$idx] = $q['correct_index'];
            $randomized[] = $q;
        }

        return $randomized;
    }

    /** @return array{questions: array<int, array{prompt: string, options: array<int, string>, correct_index: int, skill: string}>, source: string} */
    public function generateQuiz(
        string $subject,
        string $topic,
        int $count,
        string $difficulty,
        ?string $pdfText = null,
        ?string $pdfBase64 = null,
        ?string $pdfName = null,
    ): array {
        $targetCount = max(1, min(50, $count));
        $cleanSentences = $this->extractCleanSentences((string) $pdfText);
        $cleanPdfText = implode(' ', $cleanSentences);
        $cleanPdfName = trim((string) $pdfName);
        $hasPdf = $cleanPdfText !== '' || ! empty($pdfBase64) || $cleanPdfName !== '';

        $key = config('services.gemini.key');
        if (! $key) {
            $questions = $hasPdf
                ? $this->generateQuestionsFromPdf($cleanPdfText, $cleanPdfName, $topic, $subject, $targetCount)
                : $this->sampleQuestions($topic, $subject, $targetCount);

            return [
                'questions' => array_slice($questions, 0, $targetCount),
                'source' => $hasPdf ? 'pdf-template' : 'local-template',
            ];
        }

        $schema = [
            'type' => 'OBJECT',
            'properties' => [
                'questions' => [
                    'type' => 'ARRAY',
                    'items' => ['type' => 'OBJECT', 'properties' => [
                        'prompt' => ['type' => 'STRING'],
                        'options' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                        'correct_index' => ['type' => 'INTEGER'],
                        'skill' => ['type' => 'STRING'],
                    ], 'required' => ['prompt', 'options', 'correct_index', 'skill']],
                ],
            ],
            'required' => ['questions'],
        ];

        $prompt = $hasPdf
            ? "Create exactly {$targetCount} {$difficulty} four-option multiple-choice quiz questions for {$subject} (topic/unit: {$topic}) based directly on the uploaded PDF reference material"
                .($cleanPdfName !== '' ? " (\"{$cleanPdfName}\")" : '').'. '
                .($cleanPdfText !== '' ? "PDF Reference Content Excerpt:\n".Str::limit($cleanPdfText, 9000, '')."\n\n" : '')
                .'Every question must have four distinct options, one unambiguous correct answer, a correct_index from 0 to 3, and a short skill label derived from the PDF material. Return only the requested JSON.'
            : "Create exactly {$targetCount} {$difficulty} four-option multiple-choice quiz questions for {$subject}, topic: {$topic}. "
                .'Use age-appropriate, factually accurate wording. Every question needs exactly four distinct options, one unambiguous correct answer, a correct_index from 0 to 3, and a short skill label. Return only the requested JSON.';

        $parts = [];
        if (! empty($pdfBase64)) {
            $rawBase64 = preg_replace('/^data:application\/pdf;base64,/i', '', trim($pdfBase64)) ?? '';
            if ($rawBase64 !== '' && strlen($rawBase64) <= 12_000_000) {
                $parts[] = [
                    'inlineData' => [
                        'mimeType' => 'application/pdf',
                        'data' => $rawBase64,
                    ],
                ];
            }
        }
        $parts[] = ['text' => $prompt];

        $lastError = null;
        foreach ($this->candidateModels() as $model) {
            try {
                $response = Http::withoutVerifying()
                    ->withHeaders(['x-goog-api-key' => $key])
                    ->timeout(30)
                    ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                        'contents' => [['parts' => $parts]],
                        'generationConfig' => ['responseMimeType' => 'application/json', 'responseSchema' => $schema, 'temperature' => 0.35],
                    ]);

                if ($response->status() === 503 || $response->status() === 429) {
                    $lastError = new \RuntimeException("Model {$model} is currently experiencing high demand (HTTP {$response->status()}).");
                    continue;
                }

                $json = $response->throw()->json();
                $raw = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
                $questions = $this->validateQuestions($decoded['questions'] ?? [], $targetCount);
                return ['questions' => $questions, 'source' => $hasPdf ? 'gemini-pdf' : 'gemini'];
            } catch (\Throwable $error) {
                $lastError = $error;
                continue;
            }
        }

        // Graceful fallback to PDF or topic generator so teacher quiz creation never breaks if Gemini quota is reached
        $fallbackQuestions = $hasPdf
            ? $this->generateQuestionsFromPdf($cleanPdfText, $cleanPdfName, $topic, $subject, $targetCount)
            : $this->sampleQuestions($topic, $subject, $targetCount);

        return [
            'questions' => array_slice($fallbackQuestions, 0, $targetCount),
            'source' => $hasPdf ? 'pdf-template' : 'local-template',
        ];
    }

    /** @param array<int, array<string, mixed>> $questions @return array{summary: string, focus_topics: array<int, string>, action_steps: array<int, string>, references: array<int, array{title: string, url: string, description: string, source_name: string}>, source: string} */
    public function recommend(
        string $topic,
        int $score,
        int $max,
        array $questions,
        array $answers,
        ?string $pdfText = null,
        ?string $pdfName = null,
        ?string $pdfBase64 = null,
    ): array {
        $topicSafe = trim($topic) !== '' ? trim($topic) : 'Course Assessment';
        $cleanPdfName = trim((string) $pdfName);
        $cleanSentences = $this->extractCleanSentences((string) $pdfText);
        $cleanPdfText = implode(' ', $cleanSentences);
        $hasPdf = $cleanPdfName !== '' || $cleanPdfText !== '' || ! empty($pdfBase64);

        // 1. If the student achieved a Perfect Score, no further improvement or external links are needed.
        if ($max > 0 && $score >= $max) {
            return [
                'summary' => 'Perfect Score! You answered every question correctly and demonstrated 100% mastery of this assessment. No further study improvements or reference links are needed.',
                'focus_topics' => [],
                'action_steps' => [],
                'references' => [],
                'source' => $hasPdf ? 'pdf-perfect' : 'perfect',
            ];
        }

        // 2. Identify the exact missed questions and their underlying concepts
        $missedSkills = [];
        $missedDetails = [];
        foreach (array_values($questions) as $index => $question) {
            if (! is_array($question)) {
                continue;
            }
            $studentAns = $answers[$index] ?? null;
            if (! $this->isQuestionAnsweredCorrectly($question, $studentAns)) {
                $qNum = $index + 1;
                $promptText = trim((string) ($question['prompt'] ?? ''));
                $skillLabel = trim((string) ($question['skill'] ?? ''));
                if ($skillLabel === '' || strtolower($skillLabel) === 'topic understanding') {
                    $skillLabel = "{$topicSafe} (Question #{$qNum})";
                }
                $correctConcept = $this->extractCorrectConceptText($question);
                $missedSkills[] = $skillLabel;
                $missedDetails[] = [
                    'number' => $qNum,
                    'skill' => $skillLabel,
                    'prompt' => $promptText,
                    'concept' => $correctConcept,
                ];
            }
        }

        if ($missedDetails === []) {
            return [
                'summary' => 'Perfect Score! You answered every question correctly and demonstrated 100% mastery of this assessment. No further study improvements or reference links are needed.',
                'focus_topics' => [],
                'action_steps' => [],
                'references' => [],
                'source' => $hasPdf ? 'pdf-perfect' : 'perfect',
            ];
        }

        $focus = array_values(array_unique($missedSkills));
        $pdfLabel = $cleanPdfName !== '' ? $cleanPdfName : "{$topicSafe} PDF Handout";

        // Build Learning Ideas directly from the attached PDF and missed questions
        $pdfLearningIdeas = [];
        if ($hasPdf) {
            foreach (array_slice($missedDetails, 0, 4) as $item) {
                $conceptText = $item['concept'] !== ''
                    ? $item['concept']
                    : ($cleanSentences[$item['number'] % max(1, count($cleanSentences))] ?? "Review the {$item['skill']} section in {$pdfLabel}.");
                $promptSnippet = Str::limit(rtrim($item['prompt'], '? '), 95);
                $pdfLearningIdeas[] = "From {$pdfLabel} (Question #{$item['number']} · {$promptSnippet}): Key concept to remember: {$conceptText}";
            }
            foreach ($cleanSentences as $sentence) {
                if (count($pdfLearningIdeas) >= 4) {
                    break;
                }
                $candidateIdea = "PDF Handout Key Note ({$pdfLabel}): {$sentence}";
                if (! in_array($candidateIdea, $pdfLearningIdeas, true)) {
                    $pdfLearningIdeas[] = $candidateIdea;
                }
            }
            if ($pdfLearningIdeas === []) {
                $pdfLearningIdeas[] = "Open the attached PDF handout ({$pdfLabel}) and review the core principles covering ".implode(', ', array_slice($focus, 0, 3)).'.';
            }
        }

        // When a PDF is attached by the instructor, references should focus on the attached PDF handout rather than generic external websites
        $curatedReferences = $hasPdf
            ? [
                [
                    'title' => "Attached Instructor PDF: {$pdfLabel}",
                    'url' => '#attached-pdf-handout',
                    'description' => $cleanPdfText !== ''
                        ? 'Handout Excerpt: '.Str::limit($cleanPdfText, 160)
                        : "Click to open and review your instructor's uploaded PDF reference material ({$pdfLabel}) for {$topicSafe}.",
                    'source_name' => 'Instructor Uploaded PDF Handout',
                ],
            ]
            : $this->buildTopicReferences($topicSafe, $focus);

        $fallback = [
            'summary' => $hasPdf
                ? "You scored {$score} out of {$max} points. Based directly on your instructor's attached PDF handout ({$pdfLabel}), review the learning ideas below for the ".count($missedDetails).' question'.(count($missedDetails) === 1 ? '' : 's').' you missed.'
                : "You achieved {$score} of {$max} points. A focused review of ".implode(', ', array_slice($focus, 0, 3)).' will strengthen your topic accuracy and mastery.',
            'focus_topics' => array_slice($focus, 0, 5),
            'action_steps' => $hasPdf
                ? array_slice($pdfLearningIdeas, 0, 4)
                : [
                    'Review the core lesson concepts covering '.implode(' and ', array_slice($focus, 0, 2)).'.',
                    ...array_map(
                        fn (array $m) => "Question #{$m['number']} Review: Recall that {$m['concept']}",
                        array_slice($missedDetails, 0, 3)
                    ),
                ],
            'references' => $curatedReferences,
            'source' => $hasPdf ? 'pdf-learning-ideas' : 'local',
        ];

        $key = config('services.gemini.key');
        if (! $key) {
            return $fallback;
        }

        $missedSummaryLines = array_map(
            fn (array $m) => "- Question #{$m['number']}: \"{$m['prompt']}\" | Correct Concept from Material: \"{$m['concept']}\"",
            array_slice($missedDetails, 0, 8)
        );

        $prompt = $hasPdf
            ? "You are an academic tutor providing post-quiz Learning Ideas based STRICTLY on the instructor's attached PDF handout (\"{$pdfLabel}\").\n"
                ."Course Topic: {$topicSafe}. Student Score: {$score}/{$max}.\n"
                ."Questions Missed by the Student:\n".implode("\n", $missedSummaryLines)."\n\n"
                .($cleanPdfText !== '' ? "Extracted Text from Instructor's Attached PDF (\"{$pdfLabel}\"):\n".Str::limit($cleanPdfText, 7000, '')."\n\n" : '')
                ."Return JSON with:\n"
                ."- summary (string: 2-3 sentences explaining what the student should review from the attached PDF \"{$pdfLabel}\" based on their mistakes)\n"
                ."- focus_topics (array of 2-4 specific subtopics from the attached PDF that the student missed)\n"
                ."- action_steps (array of 3-4 concrete Learning Ideas & key concept explanations drawn directly from the attached PDF \"{$pdfLabel}\" that address each missed question)\n"
                ."- references (empty array [] because the learning material is the attached PDF itself)."
            : "Provide supportive, accurate educational study advice for a college learner.\n"
                ."Topic: {$topicSafe}. Score: {$score}/{$max}.\n"
                ."Questions Missed:\n".implode("\n", $missedSummaryLines)."\n\n"
                ."Return JSON with:\n"
                ."- summary (string: 2-3 sentences of constructive learning feedback)\n"
                ."- focus_topics (array of strings: specific concepts to review)\n"
                ."- action_steps (array of strings: actionable learning ideas explaining the missed concepts)\n"
                ."- references (array of 2 to 3 objects with title, url, description, and source_name with valid https educational links).";

        $parts = [];
        if ($hasPdf && ! empty($pdfBase64)) {
            $rawBase64 = preg_replace('/^data:application\/pdf;base64,/i', '', trim($pdfBase64)) ?? '';
            if ($rawBase64 !== '' && strlen($rawBase64) <= 12_000_000) {
                $parts[] = [
                    'inlineData' => [
                        'mimeType' => 'application/pdf',
                        'data' => $rawBase64,
                    ],
                ];
            }
        }
        $parts[] = ['text' => $prompt];

        foreach ($this->candidateModels() as $model) {
            try {
                $response = Http::withoutVerifying()->withHeaders(['x-goog-api-key' => $key])->timeout(18)->post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent",
                    ['contents' => [['parts' => $parts]], 'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.35]],
                );

                if ($response->status() === 503 || $response->status() === 429) {
                    continue;
                }

                $json = $response->throw()->json();
                $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $data = json_decode($text, true, flags: JSON_THROW_ON_ERROR);
                if (! is_string($data['summary'] ?? null) || ! is_array($data['focus_topics'] ?? null) || ! is_array($data['action_steps'] ?? null)) {
                    continue;
                }

                $extractedReferences = [];
                if (! $hasPdf && isset($data['references']) && is_array($data['references'])) {
                    foreach ($data['references'] as $ref) {
                        if (is_array($ref) && ! empty($ref['title']) && ! empty($ref['url'])) {
                            $rawUrl = (string) $ref['url'];
                            if (filter_var($rawUrl, FILTER_VALIDATE_URL) && str_starts_with($rawUrl, 'https://')) {
                                $extractedReferences[] = [
                                    'title' => Str::limit(strip_tags((string) $ref['title']), 120),
                                    'url' => $rawUrl,
                                    'description' => Str::limit(strip_tags((string) ($ref['description'] ?? 'Curated study material')), 180),
                                    'source_name' => Str::limit(strip_tags((string) ($ref['source_name'] ?? 'Educational Reference')), 50),
                                ];
                            }
                        }
                    }
                }

                $finalReferences = $hasPdf
                    ? $curatedReferences
                    : (count($extractedReferences) >= 2 ? array_slice($extractedReferences, 0, 4) : $curatedReferences);

                return [
                    'summary' => Str::limit(strip_tags($data['summary']), 550),
                    'focus_topics' => array_slice(array_map(fn ($v) => Str::limit(strip_tags((string) $v), 100), $data['focus_topics']), 0, 5),
                    'action_steps' => array_slice(array_map(fn ($v) => Str::limit(strip_tags((string) $v), 240), $data['action_steps']), 0, 5),
                    'references' => $finalReferences,
                    'source' => $hasPdf ? 'gemini-pdf' : 'gemini',
                ];
            } catch (\Throwable $error) {
                continue;
            }
        }

        return $fallback;
    }

    /**
     * Synthesize actionable AI pedagogical insights and teaching recommendations from aggregated
     * teacher quiz telemetry. Uses Gemini JSON output when configured, with deterministic fallback.
     *
     * @param array<string, mixed> $telemetry
     * @return array{
     *   headline: string,
     *   executive_summary: string,
     *   recommendations: array<int, array<string, string>>,
     *   teaching_strategies: array<int, string>,
     *   source: string
     * }
     */
    public function teacherInsights(array $telemetry, bool $refresh = false): array
    {
        $fallback = $this->buildTeacherInsightsFallback($telemetry);
        $summary = is_array($telemetry['summary'] ?? null) ? $telemetry['summary'] : [];
        if ((int) ($summary['total_attempts'] ?? 0) === 0) {
            return $fallback;
        }

        $cacheKey = 'lms_teacher_insights_' . sha1(json_encode([
            'v' => 1,
            'summary' => $summary,
            'weak' => array_slice($telemetry['weak_competencies'] ?? [], 0, 5),
            'missed' => array_slice($telemetry['missed_questions'] ?? [], 0, 5),
            'sections' => array_slice($telemetry['section_breakdown'] ?? [], 0, 6),
        ]) ?: '');

        if (! $refresh && ($cached = Cache::get($cacheKey)) && is_array($cached)) {
            return $cached;
        }

        $key = config('services.gemini.api_key');
        if (! is_string($key) || trim($key) === '') {
            Cache::put($cacheKey, $fallback, now()->addMinutes(10));
            return $fallback;
        }

        $prompt = "You are an academic instructional coach helping a college IT instructor improve class mastery.\n"
            . "Analyze the anonymized quiz telemetry below and return ONLY valid JSON.\n\n"
            . 'Class Summary: ' . json_encode($summary) . "\n"
            . 'Weakest Competencies: ' . json_encode(array_slice($telemetry['weak_competencies'] ?? [], 0, 5)) . "\n"
            . 'Most Missed Questions & Misconceptions: ' . json_encode(array_slice($telemetry['missed_questions'] ?? [], 0, 5)) . "\n"
            . 'Section Performance: ' . json_encode(array_slice($telemetry['section_breakdown'] ?? [], 0, 6)) . "\n\n"
            . "Return JSON with:\n"
            . "- headline (string, max 110 chars: sharp diagnosis of the main instructional priority)\n"
            . "- executive_summary (string, 2-3 concrete sentences citing specific competencies, miss rates, or sections)\n"
            . "- recommendations (array of 3-4 objects, each with: title, priority ('high'|'medium'|'positive'), category ('remediation'|'misconception'|'integrity'|'differentiation'), rationale, action_step, target_group)\n"
            . "- teaching_strategies (array of 3 concise, practical next-class teaching activities tailored to the missed topics).";

        foreach ($this->candidateModels() as $model) {
            try {
                $response = Http::withoutVerifying()->withHeaders(['x-goog-api-key' => $key])->timeout(18)->post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent",
                    [
                        'contents' => [['parts' => [['text' => $prompt]]]],
                        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.3],
                    ],
                );

                if ($response->status() === 503 || $response->status() === 429) {
                    continue;
                }

                $json = $response->throw()->json();
                $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $data = json_decode($text, true, flags: JSON_THROW_ON_ERROR);

                if (! is_string($data['headline'] ?? null) || ! is_string($data['executive_summary'] ?? null) || ! is_array($data['recommendations'] ?? null)) {
                    continue;
                }

                $allowedPriorities = ['high', 'medium', 'positive'];
                $allowedCategories = ['remediation', 'misconception', 'integrity', 'differentiation'];
                $recs = [];
                foreach (array_slice($data['recommendations'], 0, 4) as $rec) {
                    if (! is_array($rec) || empty($rec['title']) || empty($rec['action_step'])) {
                        continue;
                    }
                    $priority = strtolower((string) ($rec['priority'] ?? 'medium'));
                    $category = strtolower((string) ($rec['category'] ?? 'remediation'));
                    $recs[] = [
                        'title' => Str::limit(strip_tags((string) $rec['title']), 90),
                        'priority' => in_array($priority, $allowedPriorities, true) ? $priority : 'medium',
                        'category' => in_array($category, $allowedCategories, true) ? $category : 'remediation',
                        'rationale' => Str::limit(strip_tags((string) ($rec['rationale'] ?? '')), 240),
                        'action_step' => Str::limit(strip_tags((string) $rec['action_step']), 240),
                        'target_group' => Str::limit(strip_tags((string) ($rec['target_group'] ?? 'All scoped learners')), 80),
                    ];
                }

                if ($recs === []) {
                    continue;
                }

                $strategies = is_array($data['teaching_strategies'] ?? null)
                    ? array_values(array_filter(array_slice(array_map(
                        fn ($item) => Str::limit(strip_tags((string) $item), 220),
                        $data['teaching_strategies']
                    ), 0, 4)))
                    : $fallback['teaching_strategies'];

                $result = [
                    'headline' => Str::limit(strip_tags($data['headline']), 120),
                    'executive_summary' => Str::limit(strip_tags($data['executive_summary']), 520),
                    'recommendations' => $recs,
                    'teaching_strategies' => $strategies !== [] ? $strategies : $fallback['teaching_strategies'],
                    'source' => 'gemini',
                ];

                Cache::put($cacheKey, $result, now()->addMinutes(10));
                return $result;
            } catch (\Throwable) {
                continue;
            }
        }

        Cache::put($cacheKey, $fallback, now()->addMinutes(10));
        return $fallback;
    }

    /**
     * @param array<string, mixed> $telemetry
     * @return array{
     *   headline: string,
     *   executive_summary: string,
     *   recommendations: array<int, array<string, string>>,
     *   teaching_strategies: array<int, string>,
     *   source: string
     * }
     */
    private function buildTeacherInsightsFallback(array $telemetry): array
    {
        $summary = is_array($telemetry['summary'] ?? null) ? $telemetry['summary'] : [];
        $totalAttempts = (int) ($summary['total_attempts'] ?? 0);
        $avg = (float) ($summary['average_percentage'] ?? 0);
        $passRate = (float) ($summary['pass_rate'] ?? 0);
        $atRiskCount = (int) ($summary['at_risk_count'] ?? 0);
        $flaggedCount = (int) ($summary['flagged_attempts'] ?? 0);
        $handledYear = $summary['handled_year_level'] ?? null;

        if ($totalAttempts === 0) {
            $scopeNote = $handledYear ? " for your assigned {$handledYear} classes" : '';
            return [
                'headline' => 'Awaiting Student Assessment Data',
                'executive_summary' => "No completed submissions are recorded{$scopeNote} yet. Publish an assessment or select another quiz filter to unlock item-level misconception detection, mastery bands, and remedial quiz drafting.",
                'recommendations' => [
                    [
                        'title' => 'Publish a Baseline Diagnostic Quiz',
                        'priority' => 'medium',
                        'category' => 'remediation',
                        'rationale' => 'A short 5-item formative check establishes baseline competency before deeper lessons.',
                        'action_step' => 'Create or publish a 5-question formative quiz with 25%–30% conceptual application items.',
                        'target_group' => $handledYear ?: 'Assigned Year Level',
                    ],
                ],
                'teaching_strategies' => [
                    'Run a 5-minute ungraded warm-up poll at the start of class to calibrate prior knowledge.',
                    'Attach a concise study PDF to your first quiz so AI Study Feedback aligns directly with your handout.',
                    'Enable Live Monitoring during formative checks to spot pacing bottlenecks early.',
                ],
                'source' => 'local-heuristic',
            ];
        }

        $weakest = $telemetry['weak_competencies'][0] ?? null;
        $topMissed = $telemetry['missed_questions'][0] ?? null;
        $sections = is_array($telemetry['section_breakdown'] ?? null) ? $telemetry['section_breakdown'] : [];
        $lowestSection = $sections[0] ?? null;
        $highestSection = count($sections) > 1 ? $sections[count($sections) - 1] : null;

        $headline = $weakest
            ? "Focus Remediation on {$weakest['competency']} ({$weakest['miss_rate']}% miss rate)"
            : ($avg < 70
                ? "Class Average at {$avg}% — Immediate Concept Reinforcement Recommended"
                : "Solid Class Mastery ({$avg}% avg) — Target Remaining Gaps");

        $weakSentence = $weakest
            ? "The lowest competency is {$weakest['competency']} at {$weakest['accuracy']}% accuracy ({$weakest['missed_count']} missed responses)."
            : 'Performance varies across assessed items.';
        $sectionSentence = ($lowestSection && $highestSection && $lowestSection['section'] !== $highestSection['section'])
            ? " {$lowestSection['section']} averages {$lowestSection['average_percentage']}%, trailing {$highestSection['section']} ({$highestSection['average_percentage']}%)."
            : ($lowestSection ? " {$lowestSection['section']} currently averages {$lowestSection['average_percentage']}%." : '');
        $integritySentence = $flaggedCount > 0
            ? " {$flaggedCount} submission(s) recorded proctoring integrity alerts requiring verification."
            : '';

        $executiveSummary = "Across {$totalAttempts} submission(s) (" . ($handledYear ?: 'all handled classes') . "), composite mastery is {$avg}% with a {$passRate}% pass rate. {$weakSentence}{$sectionSentence}{$integritySentence}";

        $recommendations = [];

        if ($weakest) {
            $recommendations[] = [
                'title' => "Reteach \"{$weakest['competency']}\"",
                'priority' => ((float) $weakest['accuracy'] < 60) ? 'high' : 'medium',
                'category' => 'remediation',
                'rationale' => "Only {$weakest['accuracy']}% of responses on {$weakest['competency']} were correct ({$weakest['missed_count']} of {$weakest['questions_answered']} missed).",
                'action_step' => "Spend the first 12 minutes of your next lecture walking through a worked example on {$weakest['competency']}, then launch a 5-question remedial formative quiz.",
                'target_group' => $lowestSection['section'] ?? ($handledYear ?: 'All Learners'),
            ];
        }

        if ($topMissed) {
            $wrongHint = ! empty($topMissed['most_common_wrong_answer'])
                ? " Many learners selected \"{$topMissed['most_common_wrong_answer']}\"."
                : '';
            $recommendations[] = [
                'title' => "Address Top Misconception ({$topMissed['miss_rate']}% Missed)",
                'priority' => ((float) $topMissed['miss_rate'] >= 50) ? 'high' : 'medium',
                'category' => 'misconception',
                'rationale' => "Item \"" . Str::limit((string) $topMissed['prompt'], 75) . "\" had a {$topMissed['miss_rate']}% error rate.{$wrongHint}",
                'action_step' => 'Present this exact question anonymously in class and ask learners why the popular distractor is tempting before revealing why the rubric rejects it.',
                'target_group' => $topMissed['quiz_title'] ?? 'Quiz Takers',
            ];
        }

        if ($atRiskCount > 0) {
            $recommendations[] = [
                'title' => "Support {$atRiskCount} At-Risk Learner(s) (<60%)",
                'priority' => 'high',
                'category' => 'differentiation',
                'rationale' => "{$atRiskCount} submission(s) scored below the 60% mastery threshold and risk falling behind upcoming summative assessments.",
                'action_step' => 'Assign the Priority Intervention students a targeted review quiz with Allow Review enabled and pair them with Proficient peers.',
                'target_group' => "{$atRiskCount} Flagged / Below-60% Learner(s)",
            ];
        }

        if ($flaggedCount > 0) {
            $recommendations[] = [
                'title' => "Audit {$flaggedCount} Proctoring Integrity Alert(s)",
                'priority' => 'medium',
                'category' => 'integrity',
                'rationale' => 'Tab switches or focus losses occurred during quiz attempts, which can distort actual mastery readings.',
                'action_step' => 'Inspect timestamps in Submission Logs and enable question shuffling for your next summative exam.',
                'target_group' => 'Flagged Attempts',
            ];
        } elseif ($avg >= 80) {
            $recommendations[] = [
                'title' => 'Extend Mastery with Applied Challenges',
                'priority' => 'positive',
                'category' => 'differentiation',
                'rationale' => "Strong overall average ({$avg}%) indicates readiness beyond recall-level items.",
                'action_step' => 'Introduce 2–3 debugging or scenario-analysis questions in the next assessment to stretch top performers.',
                'target_group' => $highestSection['section'] ?? 'High-Performing Cohort',
            ];
        }

        $strategies = [
            $weakest
                ? "10-Minute Micro-Reteach + 5-Item Exit Ticket focused specifically on {$weakest['competency']}."
                : 'Peer Error Analysis: divide the class into pairs to defend answers on the top 2 missed items.',
            $lowestSection && $highestSection && $lowestSection['section'] !== $highestSection['section']
                ? "Targeted Scaffolding for {$lowestSection['section']} ({$lowestSection['average_percentage']}%): provide an annotated formula/syntax sheet before the next lab."
                : 'Guided Think-Aloud: walk through one missed scenario step-by-step, highlighting why common distractors fail.',
            'Deploy a one-click AI Remedial Practice Quiz (Allow Review ON) so struggling learners reinforce concepts before summative grading.',
        ];

        return [
            'headline' => Str::limit($headline, 120),
            'executive_summary' => Str::limit($executiveSummary, 520),
            'recommendations' => array_slice($recommendations, 0, 4),
            'teaching_strategies' => $strategies,
            'source' => 'local-heuristic',
        ];
    }

    /**
     * Determine if a student's answer for a question is correct across all 5 question types.
     *
     * @param array<string, mixed> $question
     */
    private function isQuestionAnsweredCorrectly(array $question, mixed $rawAnswer): bool
    {
        $type = (string) ($question['type'] ?? 'multiple_choice');
        if ($type === 'identification') {
            $studentText = is_string($rawAnswer) || is_numeric($rawAnswer) ? trim((string) $rawAnswer) : '';
            if ($studentText === '') {
                return false;
            }
            $keyText = trim((string) ($question['correct_answer'] ?? ($question['options'][0] ?? '')));
            $accepted = array_values(array_filter(array_map(
                fn ($s) => strtolower(trim($s)),
                explode(',', $keyText)
            ), fn ($s) => $s !== ''));
            if ($accepted === []) {
                $accepted = [strtolower($keyText)];
            }
            return in_array(strtolower($studentText), $accepted, true);
        }

        if ($type === 'essay') {
            $studentText = is_string($rawAnswer) || is_numeric($rawAnswer) ? trim((string) $rawAnswer) : '';
            if ($studentText === '') {
                return false;
            }
            $keyText = trim((string) ($question['correct_answer'] ?? ($question['options'][0] ?? '')));
            if ($keyText === '') {
                return strlen($studentText) >= 10;
            }
            return str_contains(strtolower($studentText), strtolower($keyText)) || strlen($studentText) >= 15;
        }

        if ($type === 'multiple_answer') {
            $selected = [];
            if (is_array($rawAnswer)) {
                foreach ($rawAnswer as $idx) {
                    if (is_numeric($idx) && (int) $idx >= 0) {
                        $selected[] = (int) $idx;
                    }
                }
            }
            $selected = array_values(array_unique($selected));
            sort($selected);
            $correctIndices = is_array($question['correct_indices'] ?? null) && ! empty($question['correct_indices'])
                ? array_values(array_unique(array_map('intval', $question['correct_indices'])))
                : [(int) ($question['correct_index'] ?? 0)];
            sort($correctIndices);
            return $selected !== [] && $selected === $correctIndices;
        }

        $picked = is_numeric($rawAnswer) ? (int) $rawAnswer : -1;
        return $picked >= 0 && $picked === (int) ($question['correct_index'] ?? 0);
    }

    /**
     * Extract the human-readable correct concept or statement from a question.
     *
     * @param array<string, mixed> $question
     */
    private function extractCorrectConceptText(array $question): string
    {
        $type = (string) ($question['type'] ?? 'multiple_choice');
        if ($type === 'identification' || $type === 'essay') {
            return trim((string) ($question['correct_answer'] ?? ($question['options'][0] ?? '')));
        }
        if ($type === 'multiple_answer') {
            $options = is_array($question['options'] ?? null) ? array_values($question['options']) : [];
            $indices = is_array($question['correct_indices'] ?? null) && ! empty($question['correct_indices'])
                ? array_map('intval', $question['correct_indices'])
                : [(int) ($question['correct_index'] ?? 0)];
            $parts = [];
            foreach ($indices as $i) {
                if (isset($options[$i])) {
                    $parts[] = trim((string) $options[$i]);
                }
            }
            return implode('; ', $parts);
        }
        $options = is_array($question['options'] ?? null) ? array_values($question['options']) : [];
        $correctIdx = (int) ($question['correct_index'] ?? 0);
        return trim((string) ($options[$correctIdx] ?? ($options[0] ?? '')));
    }

    /** @param array<int, string> $focus @return array<int, array{title: string, url: string, description: string, source_name: string}> */
    private function buildTopicReferences(string $topic, array $focus): array
    {
        $primarySkill = ! empty($focus) ? $focus[0] : $topic;
        $encodedTopic = urlencode($topic);
        $encodedSkill = urlencode($primarySkill);

        return [
            [
                'title' => "Khan Academy: {$topic} Study Module",
                'url' => "https://www.khanacademy.org/search?page_search_query={$encodedTopic}",
                'description' => "Interactive lessons, video walkthroughs, and practice problems focused on {$topic}.",
                'source_name' => 'Khan Academy',
            ],
            [
                'title' => "Wikipedia Knowledge Base: {$topic}",
                'url' => "https://en.wikipedia.org/wiki/Special:Search?search={$encodedTopic}",
                'description' => "Academic summaries, diagrams, and comprehensive definitions for {$topic}.",
                'source_name' => 'Wikipedia Library',
            ],
            [
                'title' => "DepEd LR Portal Competency: {$primarySkill}",
                'url' => "https://lrmds.deped.gov.ph/search?query={$encodedSkill}",
                'description' => "Official curriculum guides and self-learning modules for {$primarySkill}.",
                'source_name' => 'DepEd Learning Resource',
            ],
        ];
    }

    /**
     * Generate clear, understandable multiple-choice questions from verified PDF text
     * or topic-specific academic concepts when offline/local.
     *
     * @return array<int, array{prompt: string, options: array<int, string>, correct_index: int, skill: string}>
     */
    public function generateQuestionsFromPdf(string $pdfText, string $pdfName, string $topic, string $subject, int $count): array
    {
        $targetCount = max(1, min(50, $count));
        $rawTitleFromPdf = $pdfName !== '' ? pathinfo($pdfName, PATHINFO_FILENAME) : '';
        $cleanPdfTitle = trim(preg_replace('/^(Module\s*\d+[\s_:-]*)/i', '', str_replace(['_', '-'], ' ', $rawTitleFromPdf)) ?? '');
        $cleanTopic = trim($topic) ?: ($cleanPdfTitle ?: 'Core Course Concepts');
        $cleanSubject = trim($subject) ?: 'Information Technology';

        // Extract only verified, human-readable sentences from the PDF
        $sentences = $this->extractCleanSentences($pdfText);

        $generated = [];
        $questionStems = [
            "According to the course material on {$cleanTopic}, which of the following statements is correct?",
            "Which principle or concept is emphasized in the {$cleanTopic} module?",
            "In the context of {$cleanTopic}, which statement accurately describes a core concept from the handout?",
            "Based on the lesson coverage for {$cleanTopic}, which of the following is a valid technical takeaway?",
            "When studying {$cleanTopic} in {$cleanSubject}, which key point is highlighted in the reference material?",
        ];

        $distractorPools = [
            [
                "Security controls, data validation, and access policies are unnecessary when implementing {$cleanTopic}.",
                "All data in {$cleanTopic} should be stored in unencrypted plain text without backup or integrity checks.",
                "System performance in {$cleanTopic} is achieved by removing authentication and error handling.",
            ],
            [
                "{$cleanTopic} operates without structured protocols, schema definitions, or architectural standards.",
                "Documentation and modular design are discouraged when configuring {$cleanTopic}.",
                "Verification testing is skipped entirely during the deployment of {$cleanTopic}.",
            ],
            [
                "Redundancy, confidentiality, and integrity are ignored in modern {$cleanTopic} implementations.",
                "{$cleanTopic} relies exclusively on manual unverified inputs rather than automated validation.",
                "Scalability and maintainability have no impact on {$cleanTopic} architecture.",
            ],
        ];

        foreach ($sentences as $idx => $statement) {
            $shortStatement = Str::limit($statement, 160);
            $stem = $questionStems[$idx % count($questionStems)];
            $distractors = $distractorPools[$idx % count($distractorPools)];
            $correctPos = $idx % 4;

            $options = $distractors;
            array_splice($options, $correctPos, 0, [$shortStatement]);

            $generated[] = [
                'prompt' => $stem,
                'options' => array_values($options),
                'correct_index' => $correctPos,
                'skill' => "{$cleanTopic} Concept #".($idx + 1),
            ];
            if (count($generated) >= $targetCount) {
                return $generated;
            }
        }

        // Topic-aware intelligible academic questions (including Secure Data Storage, Database, Networking, Programming, etc.)
        $baseQuestions = $this->sampleQuestions($cleanTopic.' '.$cleanPdfTitle, $cleanSubject, $targetCount);
        foreach ($baseQuestions as $baseQuestion) {
            $generated[] = $baseQuestion;
            if (count($generated) >= $targetCount) {
                break;
            }
        }

        return $this->randomizeOptionsPreservingCorrectAnswer(array_slice($generated, 0, $targetCount));
    }

    /** @return array<int, string> */
    private function candidateModels(): array
    {
        $configured = (string) config('services.gemini.model', 'gemini-2.5-flash');
        $pool = [
            'gemini-2.5-flash',
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
            $configured,
        ];
        return array_values(array_unique(array_filter($pool)));
    }

    /** @param array<mixed> $questions @return array<int, array{prompt: string, options: array<int, string>, correct_index: int, skill: string}> */
    private function validateQuestions(array $questions, int $count): array
    {
        if (empty($questions)) {
            throw new \UnexpectedValueException('No questions generated by AI provider.');
        }

        $clean = [];
        foreach ($questions as $question) {
            if (! is_array($question)) {
                continue;
            }

            $prompt = trim(strip_tags((string) ($question['prompt'] ?? '')));
            if ($prompt === '') {
                continue;
            }

            $rawOptions = is_array($question['options'] ?? null) ? $question['options'] : [];
            $options = [];
            foreach ($rawOptions as $opt) {
                $cleanedOpt = trim(strip_tags((string) $opt));
                if ($cleanedOpt !== '' && ! in_array($cleanedOpt, $options, true)) {
                    $options[] = $cleanedOpt;
                }
            }

            // Ensure exactly 4 distinct options
            while (count($options) < 4) {
                $options[] = 'Option ' . (count($options) + 1);
            }
            if (count($options) > 4) {
                $options = array_slice($options, 0, 4);
            }

            // Robust correct_index resolution (0-indexed 0..3)
            $rawIndex = $question['correct_index'] ?? 0;
            $correctIndex = is_numeric($rawIndex) ? (int) $rawIndex : 0;
            if ($correctIndex >= 4) {
                $correctIndex = ($correctIndex === 4) ? 3 : max(0, min(3, $correctIndex - 1));
            } elseif ($correctIndex < 0) {
                $correctIndex = 0;
            }

            $skill = trim(strip_tags((string) ($question['skill'] ?? 'Topic understanding')));

            $clean[] = [
                'prompt' => Str::limit($prompt, 500),
                'options' => $options,
                'correct_index' => $correctIndex,
                'skill' => Str::limit($skill !== '' ? $skill : 'Topic understanding', 100),
            ];

            if (count($clean) === $count) {
                break;
            }
        }

        if (empty($clean)) {
            throw new \UnexpectedValueException('Could not parse any valid questions from AI response.');
        }

        return $this->randomizeOptionsPreservingCorrectAnswer($clean);
    }

    /** @return array<int, array{prompt: string, options: array<int, string>, correct_index: int, skill: string}> */
    private function sampleQuestions(string $topic, string $subject = 'Information Technology', int $count = 5): array
    {
        $sets = [
            'ecosystems' => [
                ['What is an ecosystem?', ['A community of organisms interacting with each other and their environment', 'A single animal living alone', 'Only the nonliving parts of a place', 'A group of organisms of one species'], 0, 'Ecosystem structure'],
                ['Which is a producer in most ecosystems?', ['Mushroom', 'Green plant', 'Hawk', 'Earthworm'], 1, 'Food chains'],
                ['What role do decomposers play?', ['They make sunlight', 'They hunt every consumer', 'They break down dead matter and recycle nutrients', 'They stop energy transfer'], 2, 'Decomposition'],
                ['What is the main source of energy for most ecosystems?', ['The Sun', 'Soil minerals', 'Wind', 'The Moon'], 0, 'Energy flow'],
                ['If a predator population drops, what may happen first to its prey?', ['The prey population may increase', 'All plants disappear immediately', 'The prey becomes a producer', 'The ecosystem loses sunlight'], 0, 'Population relationships'],
            ],
            'photosynthesis' => [
                ['What do plants mainly take in from the air for photosynthesis?', ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], 1, 'Inputs to photosynthesis'],
                ['Where does most photosynthesis happen in a plant cell?', ['Nucleus', 'Chloroplast', 'Cell wall', 'Vacuole'], 1, 'Chloroplasts'],
                ['What form of energy powers photosynthesis?', ['Sound', 'Light', 'Motion', 'Magnetism'], 1, 'Energy conversion'],
                ['Which sugar is produced during photosynthesis?', ['Glucose', 'Starch only', 'Protein', 'Cellulose only'], 0, 'Products of photosynthesis'],
                ['Which gas is released as a product of photosynthesis?', ['Carbon dioxide', 'Oxygen', 'Methane', 'Nitrogen'], 1, 'Products of photosynthesis'],
            ],
            'fractions' => [
                ['Which fraction is equivalent to 1/2?', ['2/3', '2/4', '3/5', '1/3'], 1, 'Equivalent fractions'],
                ['What is 1/4 + 2/4?', ['3/8', '3/4', '2/8', '1/2'], 1, 'Adding like denominators'],
                ['Which fraction is greatest?', ['1/5', '1/2', '1/4', '1/8'], 1, 'Comparing fractions'],
                ['What is 3/6 in simplest form?', ['1/2', '1/3', '2/3', '3/5'], 0, 'Simplifying fractions'],
                ['What is 2/3 of 12?', ['6', '8', '9', '10'], 1, 'Fraction of a quantity'],
            ],
            'secure data storage' => [
                ['What is the primary purpose of encryption at rest in secure data storage?', ['To protect stored data on disks or databases from unauthorized access if physical or storage media is compromised', 'To increase the file size of stored documents for faster network routing', 'To bypass user authentication during database queries', 'To disable automatic backups on cloud servers'], 0, 'Encryption at Rest'],
                ['Which security principle ensures that stored data has not been tampered with or altered by unauthorized users?', ['Data Integrity (using cryptographic hashes, checksums, or digital signatures)', 'Data Redundancy without access controls', 'Open public read-write file permissions', 'Storing passwords in plain text configuration files'], 0, 'Data Integrity'],
                ['In secure data storage architecture, what does the Principle of Least Privilege require?', ['Users and services are granted only the minimum storage access permissions needed to perform their authorized tasks', 'Every user account is given full administrator access to all storage buckets', 'Encryption keys are shared publicly across all client devices', 'Database logs are disabled to save disk space'], 0, 'Access Control & Least Privilege'],
                ['Which strategy best protects an organization against data loss from ransomware or hardware failure?', ['Maintaining regular, isolated, and encrypted 3-2-1 backups with tested recovery procedures', 'Storing a single copy of all production files on the local web server', 'Disabling firewall rules on the database server', 'Allowing anonymous FTP uploads to the storage volume'], 0, 'Backup & Disaster Recovery'],
                ['How should sensitive credentials and encryption keys be managed in a secure storage system?', ['Stored in a dedicated Key Management Service (KMS) or Hardware Security Module (HSM) with key rotation', 'Hardcoded directly inside frontend JavaScript source files', 'Sent in plain text inside URL query parameters', 'Written in public repository README files'], 0, 'Key Management'],
            ],
            'storage' => [
                ['What is the primary purpose of encryption at rest in secure data storage?', ['To protect stored data on disks or databases from unauthorized access if storage media is compromised', 'To increase the file size of stored documents for faster network routing', 'To bypass user authentication during database queries', 'To disable automatic backups on cloud servers'], 0, 'Encryption at Rest'],
                ['Which security principle ensures that stored data has not been tampered with or altered by unauthorized users?', ['Data Integrity (using cryptographic hashes, checksums, or digital signatures)', 'Data Redundancy without access controls', 'Open public read-write file permissions', 'Storing passwords in plain text configuration files'], 1 === 1 ? 0 : 1, 'Data Integrity'],
                ['In secure data storage architecture, what does the Principle of Least Privilege require?', ['Users and services are granted only the minimum storage access permissions needed to perform their tasks', 'Every user account is given full administrator access to all storage buckets', 'Encryption keys are shared publicly across all client devices', 'Database logs are disabled to save disk space'], 0, 'Access Control & Least Privilege'],
                ['Which strategy best protects an organization against data loss from ransomware or hardware failure?', ['Maintaining regular, isolated, and encrypted backups with tested recovery procedures', 'Storing a single copy of all production files on the local web server', 'Disabling firewall rules on the database server', 'Allowing anonymous uploads to the storage volume'], 0, 'Backup & Disaster Recovery'],
                ['How should sensitive credentials and encryption keys be managed in a secure storage system?', ['Stored in a dedicated Key Management Service (KMS) or Hardware Security Module (HSM) with key rotation', 'Hardcoded directly inside frontend JavaScript source files', 'Sent in plain text inside URL query parameters', 'Written in public repository README files'], 0, 'Key Management'],
            ],
        ];
        $targetCount = max(1, min(50, $count));
        $key = Str::lower(trim($topic));
        foreach ($sets as $name => $questions) {
            if (str_contains($key, $name)) {
                $mapped = array_map(fn ($q) => ['prompt' => $q[0], 'options' => $q[1], 'correct_index' => $q[2], 'skill' => $q[3]], $questions);
                $results = [];
                for ($i = 0; $i < $targetCount; $i++) {
                    $results[] = $mapped[$i % count($mapped)];
                }
                return $this->randomizeOptionsPreservingCorrectAnswer($results);
            }
        }

        // Dynamic BSIT / Collegiate template questions for any course topic
        $cleanTopic = trim($topic) ?: 'Core Concepts';
        $cleanSubject = trim($subject) ?: 'BSIT Course';
        $templates = [
            ["Which statement best defines the primary objective of {$cleanTopic} in {$cleanSubject}?", ["Applying structured principles and methodologies to solve problems in {$cleanTopic}", "Ignoring system requirements and documentation standards", "Relying solely on unverified trial-and-error approaches", "Eliminating testing and validation phases"], 0, "{$cleanTopic} Fundamentals"],
            ["When designing or analyzing a solution involving {$cleanTopic}, which practice ensures maintainability and accuracy?", ["Following modular design, clear documentation, and standard conventions", "Hardcoding all parameters without validation", "Skipping peer review and verification checks", "Using ambiguous naming and unstructured logic"], 0, "Best Practices in {$cleanTopic}"],
            ["What is a key advantage of mastering {$cleanTopic} within the {$cleanSubject} curriculum?", ["It enables systematic analysis, efficient implementation, and scalable problem solving", "It removes the need for algorithmic thinking", "It restricts interoperability between software components", "It prevents future system upgrades"], 0, "Applied {$cleanTopic}"],
            ["Which factor is most critical when evaluating performance and reliability in {$cleanTopic}?", ["Correctness, efficiency, and adherence to specification requirements", "Visual appearance of source files only", "Minimizing comments regardless of complexity", "Avoiding edge-case testing"], 0, "Evaluation & Quality Assurance"],
            ["In a real-world project scenario for {$cleanSubject}, how should errors or edge cases in {$cleanTopic} be handled?", ["By implementing proper validation, exception handling, and systematic testing", "By suppressing all warnings and continuing execution blindly", "By deferring all checks to end users", "By disabling logging and diagnostics"], 0, "Troubleshooting & Validation"],
            ["Which approach best supports collaborative development when working on {$cleanTopic}?", ["Consistent standards, version control, and clear technical communication", "Isolated changes without documentation", "Duplicating logic across unrelated modules", "Bypassing integration testing"], 0, "Collaborative Engineering"],
            ["How does {$cleanTopic} contribute to overall system architecture in {$cleanSubject}?", ["It provides a foundational layer for structured data processing and reliable execution", "It replaces all hardware components", "It eliminates the need for security controls", "It operates independently of user requirements"], 0, "Architectural Integration"],
            ["What is the first step before implementing a complex feature related to {$cleanTopic}?", ["Analyzing the problem requirements, constraints, and expected inputs/outputs", "Deploying directly to production without a plan", "Optimizing code before defining requirements", "Removing existing test cases"], 0, "Requirement Analysis"],
            ["Which metric best indicates a successful implementation of {$cleanTopic}?", ["Meeting functional specifications with verified test coverage and optimal efficiency", "Having the longest possible source file", "Using the most complex syntax available", "Avoiding user feedback"], 0, "Implementation Metrics"],
            ["Why is continuous review important when studying {$cleanTopic} in {$cleanSubject}?", ["It reinforces core competencies and bridges theoretical concepts with practical application", "It memorizes answers without understanding underlying logic", "It limits adaptation to modern technologies", "It replaces hands-on laboratory practice"], 0, "Competency Mastery"],
        ];

        $mappedTemplates = array_map(fn ($q) => ['prompt' => $q[0], 'options' => $q[1], 'correct_index' => $q[2], 'skill' => $q[3]], $templates);
        $results = [];
        for ($i = 0; $i < $targetCount; $i++) {
            $results[] = $mappedTemplates[$i % count($mappedTemplates)];
        }

        return $this->randomizeOptionsPreservingCorrectAnswer($results);
    }
}

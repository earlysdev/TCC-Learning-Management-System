<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LmsAiService
{
    /** @return array{questions: array<int, array{prompt: string, options: array<int, string>, correct_index: int, skill: string}>, source: string} */
    public function generateQuiz(string $subject, string $topic, int $count, string $difficulty): array
    {
        $key = config('services.gemini.key');
        if (! $key) {
            $questions = $this->sampleQuestions($topic, $subject, $count);
            return ['questions' => array_slice($questions, 0, $count), 'source' => 'local-template'];
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
        $prompt = "Create exactly {$count} {$difficulty} four-option multiple-choice quiz questions for {$subject}, topic: {$topic}. "
            .'Use age-appropriate, factually accurate wording. Every question needs exactly four distinct options, one unambiguous correct answer, a correct_index from 0 to 3, and a short skill label. Return only the requested JSON.';

        $lastError = null;
        foreach ($this->candidateModels() as $model) {
            try {
                $response = Http::withoutVerifying()
                    ->withHeaders(['x-goog-api-key' => $key])
                    ->timeout(25)
                    ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent", [
                        'contents' => [['parts' => [['text' => $prompt]]]],
                        'generationConfig' => ['responseMimeType' => 'application/json', 'responseJsonSchema' => $schema, 'temperature' => 0.35],
                    ]);

                if ($response->status() === 503 || $response->status() === 429) {
                    $lastError = new \RuntimeException("Model {$model} is currently experiencing high demand (HTTP {$response->status()}).");
                    continue;
                }

                $json = $response->throw()->json();
                $raw = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $decoded = json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
                $questions = $this->validateQuestions($decoded['questions'] ?? [], $count);
                return ['questions' => $questions, 'source' => 'gemini'];
            } catch (\Throwable $error) {
                $lastError = $error;
                continue;
            }
        }

        report($lastError);
        $reason = Str::limit($lastError?->getMessage() ?? 'Service unavailable', 120);
        throw ValidationException::withMessages([
            'topic' => ['The AI provider could not generate this quiz ('.$reason.'). Please retry or check your Gemini settings.'],
        ]);
    }

    /** @param array<int, array<string, mixed>> $questions @return array{summary: string, focus_topics: array<int, string>, action_steps: array<int, string>, references: array<int, array{title: string, url: string, description: string, source_name: string}>, source: string} */
    public function recommend(string $topic, int $score, int $max, array $questions, array $answers): array
    {
        $missed = [];
        foreach ($questions as $index => $question) {
            if (($answers[$index] ?? null) !== $question['correct_index']) {
                $missed[] = (string) ($question['skill'] ?? $topic);
            }
        }
        $focus = array_values(array_unique($missed));
        $topicSafe = trim($topic);
        $curatedReferences = $this->buildTopicReferences($topicSafe, $focus);

        if ($focus === []) {
            return [
                'summary' => 'Outstanding work! You demonstrated complete mastery across all tested learning competencies for '.$topicSafe.'.',
                'focus_topics' => [],
                'action_steps' => [
                    'Proceed to subsequent modules or challenge yourself with advanced problem sets in '.$topicSafe.'.',
                    'Share your mastery and mentor peers reviewing this unit.'
                ],
                'references' => $curatedReferences,
                'source' => 'local',
            ];
        }

        $fallback = [
            'summary' => "You achieved {$score} of {$max} points. A focused review of ".implode(', ', array_slice($focus, 0, 2)).' will strengthen your topic accuracy and exam readiness.',
            'focus_topics' => array_slice($focus, 0, 4),
            'action_steps' => [
                'Review the core lesson notes and reference study links below for '.implode(' and ', array_slice($focus, 0, 2)).'.',
                'Engage with the interactive practice modules and self-learning materials provided in the references.',
                'Clarify specific misconceptions with your teacher during the next class session.'
            ],
            'references' => $curatedReferences,
            'source' => 'local',
        ];

        $key = config('services.gemini.key');
        if (! $key) return $fallback;

        $prompt = "Provide supportive, highly accurate educational study advice for a secondary school learner. "
            ."Topic: {$topicSafe}. Score: {$score}/{$max}. Competencies missed: ".implode(', ', $focus).". "
            ."Return JSON with:\n"
            ."- summary (string: 2-3 sentences of constructive learning feedback)\n"
            ."- focus_topics (array of strings: specific concepts to review)\n"
            ."- action_steps (array of strings: actionable revision recommendations)\n"
            ."- references (array of 2 to 3 objects with title, url, description, and source_name). Ensure URLs are valid https educational links relevant to {$topicSafe} (e.g. Khan Academy, Wikipedia, or official educational portals). Do not infer personal traits or include answer keys.";

        foreach ($this->candidateModels() as $model) {
            try {
                $response = Http::withoutVerifying()->withHeaders(['x-goog-api-key' => $key])->timeout(15)->post(
                    "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent",
                    ['contents' => [['parts' => [['text' => $prompt]]]], 'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.4]],
                );

                if ($response->status() === 503 || $response->status() === 429) {
                    continue;
                }

                $json = $response->throw()->json();
                $text = $json['candidates'][0]['content']['parts'][0]['text'] ?? '';
                $data = json_decode($text, true, flags: JSON_THROW_ON_ERROR);
                if (! is_string($data['summary'] ?? null) || ! is_array($data['focus_topics'] ?? null) || ! is_array($data['action_steps'] ?? null)) continue;

                $extractedReferences = [];
                if (isset($data['references']) && is_array($data['references'])) {
                    foreach ($data['references'] as $ref) {
                        if (is_array($ref) && !empty($ref['title']) && !empty($ref['url'])) {
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

                $finalReferences = count($extractedReferences) >= 2
                    ? array_slice($extractedReferences, 0, 4)
                    : $curatedReferences;

                return [
                    'summary' => Str::limit(strip_tags($data['summary']), 500),
                    'focus_topics' => array_slice(array_map(fn ($v) => Str::limit(strip_tags((string) $v), 100), $data['focus_topics']), 0, 5),
                    'action_steps' => array_slice(array_map(fn ($v) => Str::limit(strip_tags((string) $v), 180), $data['action_steps']), 0, 4),
                    'references' => $finalReferences,
                    'source' => 'gemini',
                ];
            } catch (\Throwable $error) {
                continue;
            }
        }

        return $fallback;
    }

    /** @param array<int, string> $focus @return array<int, array{title: string, url: string, description: string, source_name: string}> */
    private function buildTopicReferences(string $topic, array $focus): array
    {
        $primarySkill = !empty($focus) ? $focus[0] : $topic;
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

    /** @return array<int, string> */
    private function candidateModels(): array
    {
        $primary = (string) config('services.gemini.model', 'gemini-3.5-flash');
        $pool = [$primary, 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
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

        return $clean;
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
        ];
        $key = Str::lower(trim($topic));
        foreach ($sets as $name => $questions) {
            if (str_contains($key, $name)) {
                return array_map(fn ($q) => ['prompt' => $q[0], 'options' => $q[1], 'correct_index' => $q[2], 'skill' => $q[3]], $questions);
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

        return array_slice(
            array_map(fn ($q) => ['prompt' => $q[0], 'options' => $q[1], 'correct_index' => $q[2], 'skill' => $q[3]], $templates),
            0,
            max(3, min(10, $count))
        );
    }
}

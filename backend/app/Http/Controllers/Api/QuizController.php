<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Section;
use App\Models\SecurityLog;
use App\Models\User;
use App\Services\LmsAiService;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class QuizController extends Controller
{
    public function __construct(private readonly LmsAiService $ai) {}

    public function teacherDashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAuthorized = in_array($user?->role, ['teacher', 'principal', 'dean', 'developer'], true);
        abort_unless($isAuthorized, 403, 'Your account does not have access to this area.');

        $query = Quiz::query();
        if ($user->role === 'teacher') {
            $query->where('teacher_id', $user->id);
        } else {
            $query->visibleTo($user);
        }
        $quizzes = $query->withCount('attempts')->withAvg('attempts', 'percentage')->latest()->get();
        $quizzes->each(fn (Quiz $quiz) => $this->repairQuizQuestionsIfNeeded($quiz));

        return response()->json([
            'metrics' => [
                'quizzes' => $quizzes->count(),
                'published' => $quizzes->where('is_published', true)->count(),
                'submissions' => $quizzes->sum('attempts_count'),
                'average' => round((float) ($quizzes->avg('attempts_avg_percentage') ?? 0), 1),
            ],
            'quizzes' => $quizzes->map(fn (Quiz $quiz) => $this->teacherQuizPayload($quiz)),
        ]);
    }


    public function store(Request $request): JsonResponse
    {
        $this->requireRole($request, 'teacher');
        $input = $request->validate([
            'title' => ['nullable', 'string', 'max:200'],
            'subject' => ['required', 'string', 'max:100'],
            'topic' => ['required', 'string', 'max:120'],
            'quiz_type' => ['sometimes', 'in:formative,summative'],
            'allow_review' => ['sometimes', 'boolean'],
            'count' => ['nullable', 'integer', 'between:1,50'],
            'instructions' => ['nullable', 'string'],
            'time_limit_minutes' => ['nullable', 'integer', 'between:1,300'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'questions' => ['sometimes', 'array', 'min:1'],
            'generate_with_ai' => ['sometimes', 'boolean'],
            'difficulty' => ['sometimes', 'in:easy,medium,challenging'],
            'pdf_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'pdf_text' => ['sometimes', 'nullable', 'string'],
            'pdf_base64' => ['sometimes', 'nullable', 'string'],
        ]);

        $cleanTopic = trim($input['topic']);
        $questionCount = max(1, min(50, (int) ($input['count'] ?? 3)));
        $pdf = $this->extractPdfInput($request, $input);
        $hasPdf = !empty($pdf['name']) || !empty($pdf['text']) || !empty($pdf['base64']);
        $useAi = (bool) ($input['generate_with_ai'] ?? $hasPdf);
        $difficulty = (string) ($input['difficulty'] ?? 'medium');

        $generatedByAi = false;
        if (!empty($input['questions'])) {
            $questions = $input['questions'];
        } elseif ($useAi) {
            $generated = $this->ai->generateQuiz(
                trim($input['subject']),
                $cleanTopic,
                $questionCount,
                $difficulty,
                $pdf['text'],
                $pdf['base64'],
                $pdf['name'],
            );
            $questions = $generated['questions'];
            $generatedByAi = true;
        } else {
            $questions = array_map(fn (int $i) => [
                'prompt' => '',
                'skill' => $cleanTopic,
                'points' => 1,
                'options' => ['', '', '', ''],
                'correct_index' => 0,
            ], range(1, $questionCount));
        }

        $title = !empty(trim($input['title'] ?? ''))
            ? trim($input['title'])
            : $cleanTopic;

        $defaultInstructions = $hasPdf && !empty($pdf['name'])
            ? "Refer to the attached PDF handout ({$pdf['name']}) and choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored."
            : 'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.';

        $createAttributes = [
            'teacher_id' => $request->user()->id,
            'department' => $request->user()->departmentCode(),
            'title' => $title,
            'subject' => trim($input['subject']),
            'topic' => $cleanTopic,
            'instructions' => !empty(trim((string) ($input['instructions'] ?? ''))) ? trim((string) $input['instructions']) : $defaultInstructions,
            'questions' => $questions,
            'allow_review' => (bool) ($input['allow_review'] ?? true),
            'generated_by_ai' => $generatedByAi,
            'target_type' => $input['target_type'] ?? 'all',
            'target_sections' => $input['target_sections'] ?? null,
            'time_limit_minutes' => $input['time_limit_minutes'] ?? 15,
        ];

        if ($this->ensurePdfColumns()) {
            $createAttributes['quiz_type'] = $input['quiz_type'] ?? 'formative';
            $createAttributes['reference_pdf_name'] = $pdf['name'];
            $createAttributes['reference_pdf_text'] = $pdf['text'];
            if (!empty($pdf['base64']) && strlen($pdf['base64']) <= 12_000_000) {
                $createAttributes['reference_pdf_data'] = $pdf['base64'];
            }
        }

        $quiz = Quiz::create($createAttributes);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'create_quiz',
            'description' => "Created ".($generatedByAi ? 'AI' : 'manual')." quiz \"{$quiz->title}\" ({$quiz->subject})".(!empty($pdf['name']) ? " with PDF \"{$pdf['name']}\"" : ''),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['quiz' => $this->teacherQuizPayload($quiz)], 201);
    }

    public function generate(Request $request): JsonResponse
    {
        $this->requireRole($request, 'teacher');
        $input = $request->validate([
            'quiz_id' => ['sometimes', 'nullable', 'integer'],
            'title' => ['nullable', 'string', 'max:200'],
            'subject' => ['required', 'string', 'max:100'],
            'topic' => ['required', 'string', 'max:120'],
            'quiz_type' => ['sometimes', 'in:formative,summative'],
            'allow_review' => ['sometimes', 'boolean'],
            'time_limit_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,300'],
            'count' => ['required', 'integer', 'between:1,50'],
            'difficulty' => ['sometimes', 'in:easy,medium,challenging'],
            'instructions' => ['sometimes', 'nullable', 'string'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'pdf_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'pdf_text' => ['sometimes', 'nullable', 'string'],
            'pdf_base64' => ['sometimes', 'nullable', 'string'],
            'preview_only' => ['sometimes', 'boolean'],
        ]);
        $cleanTopic = trim($input['topic']);
        $cleanTitle = !empty(trim($input['title'] ?? ''))
            ? trim($input['title'])
            : $cleanTopic;
        $difficulty = (string) ($input['difficulty'] ?? 'medium');
        $pdf = $this->extractPdfInput($request, $input);

        $generated = $this->ai->generateQuiz(
            trim($input['subject']),
            $cleanTopic,
            (int) $input['count'],
            $difficulty,
            $pdf['text'],
            $pdf['base64'],
            $pdf['name'],
        );

        // If preview_only is passed (e.g. from inside the Quiz Editor Modal), return the generated questions without creating a duplicate quiz row
        if (!empty($input['preview_only'])) {
            return response()->json([
                'questions' => $generated['questions'],
                'generation_source' => $generated['source'],
                'reference_pdf_name' => $pdf['name'],
                'reference_pdf_text' => $pdf['text'],
            ]);
        }

        $hasPdf = !empty($pdf['name']) || !empty($pdf['text']);
        $defaultInstructions = $hasPdf && !empty($pdf['name'])
            ? "Refer to the attached PDF handout ({$pdf['name']}) and choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored."
            : 'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.';

        $createAttributes = [
            'teacher_id' => $request->user()->id,
            'title' => $cleanTitle,
            'subject' => trim($input['subject']),
            'topic' => $cleanTopic,
            'instructions' => !empty(trim((string) ($input['instructions'] ?? ''))) ? trim((string) $input['instructions']) : $defaultInstructions,
            'questions' => $generated['questions'],
            'allow_review' => (bool) ($input['allow_review'] ?? true),
            'generated_by_ai' => true,
            'target_type' => $input['target_type'] ?? 'all',
            'target_sections' => $input['target_sections'] ?? null,
            'time_limit_minutes' => $input['time_limit_minutes'] ?? 15,
        ];

        if ($this->ensurePdfColumns()) {
            $createAttributes['quiz_type'] = $input['quiz_type'] ?? 'formative';
            $createAttributes['reference_pdf_name'] = $pdf['name'];
            $createAttributes['reference_pdf_text'] = $pdf['text'];
            if (!empty($pdf['base64']) && strlen($pdf['base64']) <= 12_000_000) {
                $createAttributes['reference_pdf_data'] = $pdf['base64'];
            }
        }

        $quiz = Quiz::create($createAttributes);

        return response()->json(['quiz' => $this->teacherQuizPayload($quiz), 'generation_source' => $generated['source']], 201);
    }

    public function update(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'teacher');
        abort_unless($quiz->teacher_id === $request->user()->id, 403, 'Unauthorized to edit this quiz.');

        $input = $request->validate([
            'title' => ['sometimes', 'string', 'max:200'],
            'subject' => ['sometimes', 'string', 'max:100'],
            'topic' => ['sometimes', 'string', 'max:120'],
            'quiz_type' => ['sometimes', 'in:formative,summative'],
            'instructions' => ['sometimes', 'string'],
            'allow_review' => ['sometimes', 'boolean'],
            'time_limit_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,300'],
            'shuffle_questions' => ['sometimes', 'boolean'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'target_student_ids' => ['sometimes', 'nullable', 'array'],
            'reference_pdf_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'reference_pdf_text' => ['sometimes', 'nullable', 'string'],
            'pdf_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'pdf_text' => ['sometimes', 'nullable', 'string'],
            'pdf_base64' => ['sometimes', 'nullable', 'string'],
            'questions' => ['sometimes', 'array', 'min:1'],
            'questions.*.type' => ['sometimes', 'nullable', 'string', 'in:multiple_choice,identification,true_false,multiple_answer,essay'],
            'questions.*.prompt' => ['required_with:questions', 'string'],
            'questions.*.options' => ['sometimes', 'nullable', 'array', 'max:8'],
            'questions.*.correct_index' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'questions.*.correct_indices' => ['sometimes', 'nullable', 'array'],
            'questions.*.correct_indices.*' => ['integer', 'min:0'],
            'questions.*.correct_answer' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'questions.*.points' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
            'questions.*.skill' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

        if (isset($input['questions']) && is_array($input['questions'])) {
            $input['questions'] = $this->normalizeQuizQuestions($input['questions']);
        }

        $pdf = $this->extractPdfInput($request, $input);
        unset($input['pdf_name'], $input['pdf_text'], $input['pdf_base64']);

        if ($this->ensurePdfColumns()) {
            if ($pdf['name'] !== null || array_key_exists('reference_pdf_name', $input)) {
                $input['reference_pdf_name'] = $pdf['name'] ?? $input['reference_pdf_name'] ?? null;
            }
            if ($pdf['text'] !== null || array_key_exists('reference_pdf_text', $input)) {
                $input['reference_pdf_text'] = $pdf['text'] ?? $input['reference_pdf_text'] ?? null;
            }
            if (!empty($pdf['base64']) && strlen($pdf['base64']) <= 12_000_000) {
                $input['reference_pdf_data'] = $pdf['base64'];
            }
        } else {
            unset($input['reference_pdf_name'], $input['reference_pdf_text'], $input['quiz_type']);
        }

        $quiz->update($input);

        return response()->json([
            'message' => 'Quiz updated successfully.',
            'quiz' => $this->teacherQuizPayload($quiz->fresh()->loadCount('attempts')),
        ]);
    }

    public function publish(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'teacher');
        abort_unless($quiz->teacher_id === $request->user()->id, 403, 'Unauthorized.');
        
        $input = $request->validate([
            'is_published' => ['required', 'boolean'],
            'quiz_type' => ['sometimes', 'in:formative,summative'],
            'allow_review' => ['sometimes', 'boolean'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'target_student_ids' => ['sometimes', 'nullable', 'array'],
            'time_limit_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,300'],
            'shuffle_questions' => ['sometimes', 'boolean'],
        ]);

        if (! $this->ensurePdfColumns()) {
            unset($input['quiz_type']);
        }
        
        $wasPublished = (bool) $quiz->is_published;
        $quiz->update($input);

        if (!$wasPublished && $quiz->is_published) {
            \App\Models\ActivityLog::create([
                'user_id' => $request->user()->id,
                'action' => 'publish_quiz',
                'description' => "Published quiz \"{$quiz->title}\" ({$quiz->subject})",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $students = User::where('role', 'student')->get();
            foreach ($students as $student) {
                if ($this->isStudentEligible($student, $quiz)) {
                    $sameTitleAndTopic = strtolower(trim((string) $quiz->title)) === strtolower(trim((string) $quiz->topic));
                    \App\Models\LmsNotification::create([
                        'user_id' => $student->id,
                        'recipient_role' => 'student',
                        'type' => 'quiz_published',
                        'title' => "New Quiz: {$quiz->title}",
                        'message' => $sameTitleAndTopic
                            ? "{$quiz->subject} is now open for taking."
                            : "{$quiz->subject} ({$quiz->topic}) is now open for taking.",
                        'data' => ['quiz_id' => $quiz->id],
                        'is_read' => false,
                    ]);
                }
            }
        }

        return response()->json(['quiz' => $this->teacherQuizPayload($quiz->fresh()->loadCount('attempts'))]);
    }

    public function submissions(Request $request, Quiz $quiz): JsonResponse
    {
        $user = $request->user();
        $isTeacher = $user->role === 'teacher' && $quiz->teacher_id === $user->id;
        $isAdmin = in_array($user->role, ['principal', 'dean', 'secretary', 'developer'], true);
        abort_unless($isTeacher || $isAdmin, 403, 'Unauthorized to view submissions.');
        if (! $isTeacher) {
            $this->ensureSameDepartment($request, $quiz->department);
        }

        $this->ensurePdfColumns();

        $attempts = QuizAttempt::where('quiz_id', $quiz->id)
            ->with(['student' => fn ($query) => $query->select('id', 'name', 'lrn', 'grade', 'section', 'email')])
            ->latest()
            ->get();

        $quizType = ($quiz->quiz_type ?? 'formative') === 'summative' ? 'summative' : 'formative';
        $liveSessions = $quizType === 'formative' ? $this->buildLiveSessionsList($quiz) : [];

        return response()->json([
            'quiz' => [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'quiz_type' => $quizType,
                'allow_review' => (bool) $quiz->allow_review,
                'question_count' => count($quiz->questions ?? []),
                'target_type' => $quiz->target_type,
                'time_limit_minutes' => $quiz->time_limit_minutes,
                'questions' => $quiz->questions ?? [],
            ],
            'live_sessions' => $liveSessions,
            'submissions' => $attempts->map(fn (QuizAttempt $attempt) => [
                'id' => $attempt->id,
                'student' => $attempt->student,
                'score' => $attempt->score,
                'max_score' => $attempt->max_score,
                'percentage' => $attempt->percentage,
                'cheating_attempts_count' => $attempt->cheating_attempts_count ?? 0,
                'violations' => $attempt->violations ?? [],
                'ip_address' => $attempt->ip_address,
                'started_at' => $attempt->started_at,
                'completed_at' => $attempt->completed_at ?? $attempt->created_at,
            ]),
        ]);
    }

    public function liveMonitor(Request $request, Quiz $quiz): JsonResponse
    {
        return $this->submissions($request, $quiz);
    }

    public function studentQuizzes(Request $request): JsonResponse
    {
        $this->requireRole($request, 'student');
        $student = $request->user();
        
        $quizzes = Quiz::query()
            ->where('is_published', true)
            ->with(['attempts' => fn ($query) => $query->where('student_id', $student->id)])
            ->latest()
            ->get();

        // Filter eligible quizzes based on target_type
        $eligibleQuizzes = $quizzes->filter(fn (Quiz $quiz) => $this->isStudentEligible($student, $quiz));

        $startedQuizIds = [];
        try {
            if (Schema::hasTable('quiz_live_sessions')) {
                $startedQuizIds = DB::table('quiz_live_sessions')
                    ->where('student_id', $student->id)
                    ->pluck('quiz_id')
                    ->map(fn ($id) => (int) $id)
                    ->all();
            }
        } catch (\Throwable) {
            $startedQuizIds = [];
        }

        return response()->json(['quizzes' => $eligibleQuizzes->values()->map(function (Quiz $quiz) use ($startedQuizIds): array {
            $this->repairQuizQuestionsIfNeeded($quiz);
            $attempt = $quiz->attempts->first();
            $this->refreshAttemptRecommendationIfNeeded($quiz, $attempt);
            $cleanPdfText = !empty($quiz->reference_pdf_text)
                ? implode(' ', $this->ai->extractCleanSentences((string) $quiz->reference_pdf_text))
                : null;
            $hasStarted = (bool) $attempt || in_array((int) $quiz->id, $startedQuizIds, true);
            return [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'instructions' => $quiz->instructions,
                'reference_pdf_name' => $quiz->reference_pdf_name ?? null,
                'reference_pdf_text' => $cleanPdfText ?: null,
                'has_pdf_data' => !empty($quiz->reference_pdf_data),
                'question_count' => count($quiz->questions ?? []),
                'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
                'shuffle_questions' => (bool) ($quiz->shuffle_questions ?? false),
                'quiz_type' => ($quiz->quiz_type ?? 'formative') === 'summative' ? 'summative' : 'formative',
                'allow_review' => (bool) $quiz->allow_review,
                'target_type' => $quiz->target_type,
                'attempted' => (bool) $attempt,
                'started' => $hasStarted,
                'is_locked' => $hasStarted,
                'score' => $attempt?->score,
                'max_score' => $attempt?->max_score,
                'percentage' => $attempt?->percentage,
                'cheating_attempts_count' => $attempt?->cheating_attempts_count ?? 0,
                'recommendation' => $attempt?->recommendation,
            ];
        })]);
    }

    public function showForStudent(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'student');
        abort_unless($quiz->is_published, 404, 'Quiz not found or not published.');
        
        $student = $request->user();
        abort_unless($this->isStudentEligible($student, $quiz), 403, 'This quiz is not assigned to your section or account.');

        $this->repairQuizQuestionsIfNeeded($quiz);

        $attempt = QuizAttempt::where('quiz_id', $quiz->id)->where('student_id', $student->id)->first();
        $this->refreshAttemptRecommendationIfNeeded($quiz, $attempt);
        $cleanPdfText = !empty($quiz->reference_pdf_text)
            ? implode(' ', $this->ai->extractCleanSentences((string) $quiz->reference_pdf_text))
            : null;

        if (! $attempt) {
            try {
                if (Schema::hasTable('quiz_live_sessions')) {
                    $questions = $quiz->questions ?? [];
                    $maxScore = 0;
                    foreach ($questions as $q) {
                        $maxScore += isset($q['points']) && is_numeric($q['points']) ? max(1, (int) $q['points']) : 1;
                    }
                    $existing = DB::table('quiz_live_sessions')
                        ->where('quiz_id', $quiz->id)
                        ->where('student_id', $student->id)
                        ->first();
                    if (! $existing) {
                        DB::table('quiz_live_sessions')->insert([
                            'quiz_id' => $quiz->id,
                            'student_id' => $student->id,
                            'status' => 'in_progress',
                            'current_question' => 1,
                            'answered_count' => 0,
                            'total_questions' => count($questions),
                            'current_score' => 0,
                            'max_score' => max(1, $maxScore),
                            'answers' => json_encode([]),
                            'cheating_attempts_count' => 0,
                            'time_remaining_seconds' => ($quiz->time_limit_minutes ?? 15) * 60,
                            'started_at' => Carbon::now(),
                            'last_active_at' => Carbon::now(),
                            'created_at' => Carbon::now(),
                            'updated_at' => Carbon::now(),
                        ]);
                    } else {
                        DB::table('quiz_live_sessions')
                            ->where('id', $existing->id)
                            ->update([
                                'status' => 'in_progress',
                                'total_questions' => count($questions),
                                'last_active_at' => Carbon::now(),
                                'updated_at' => Carbon::now(),
                            ]);
                    }
                }
            } catch (\Throwable) {
                // Non-blocking
            }
        }

        return response()->json([
            'quiz' => [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'instructions' => $quiz->instructions,
                'reference_pdf_name' => $quiz->reference_pdf_name ?? null,
                'reference_pdf_text' => $cleanPdfText ?: null,
                'has_pdf_data' => !empty($quiz->reference_pdf_data),
                'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
                'shuffle_questions' => (bool) ($quiz->shuffle_questions ?? false),
                'quiz_type' => ($quiz->quiz_type ?? 'formative') === 'summative' ? 'summative' : 'formative',
                'allow_review' => (bool) $quiz->allow_review,
                'questions' => collect($quiz->questions ?? [])->map(function (array $question): array {
                    $qType = (string) ($question['type'] ?? 'multiple_choice');
                    $hideOptions = in_array($qType, ['identification', 'essay'], true);
                    return [
                        'type' => $qType,
                        'prompt' => $question['prompt'] ?? '',
                        'options' => $hideOptions
                            ? []
                            : ($qType === 'true_false' ? ['True', 'False'] : ($question['options'] ?? [])),
                        'points' => (int) ($question['points'] ?? 1),
                    ];
                })->values(),
            ],
            'attempt' => $attempt ? [
                'score' => $attempt->score,
                'max_score' => $attempt->max_score,
                'percentage' => $attempt->percentage,
                'cheating_attempts_count' => $attempt->cheating_attempts_count ?? 0,
                'violations' => $attempt->violations ?? [],
                'recommendation' => $attempt->recommendation,
                'allow_review' => (bool) $quiz->allow_review,
                'answers' => $attempt->answers ?? [],
                'review_questions' => $quiz->allow_review
                    ? $this->buildReviewQuestions($quiz->questions ?? [], $attempt->answers ?? [])
                    : [],
            ] : null,
        ]);
    }

    public function updateLiveProgress(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'student');
        $student = $request->user();
        $this->ensurePdfColumns();

        $input = $request->validate([
            'answers' => ['nullable', 'array'],
            'question_order' => ['nullable', 'array'],
            'current_question' => ['nullable', 'integer', 'min:1'],
            'time_remaining_seconds' => ['nullable', 'integer', 'min:0'],
            'cheating_attempts_count' => ['nullable', 'integer', 'min:0'],
            'cursor_x' => ['nullable', 'numeric'],
            'cursor_y' => ['nullable', 'numeric'],
            'cursor_trail' => ['nullable', 'array'],
            'hovered_element' => ['nullable', 'string', 'max:255'],
            'scroll_y_pct' => ['nullable', 'numeric'],
            'device_label' => ['nullable', 'string', 'max:180'],
            'viewport_width' => ['nullable', 'integer', 'min:100', 'max:10000'],
            'viewport_height' => ['nullable', 'integer', 'min:100', 'max:10000'],
            'is_fullscreen' => ['nullable', 'boolean'],
            'is_blocked' => ['nullable', 'boolean'],
            'interruption_title' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            if (Schema::hasTable('quiz_live_sessions')) {
                $questions = $quiz->questions ?? [];
                $rawAnswers = is_array($input['answers'] ?? null) ? $input['answers'] : [];
                $answeredCount = 0;
                $currentScore = 0;
                $maxScore = 0;
                $normalizedLiveAnswers = [];

                foreach ($questions as $idx => $question) {
                    $pts = isset($question['points']) && is_numeric($question['points']) ? max(1, (int) $question['points']) : 1;
                    $maxScore += $pts;
                    $ans = $rawAnswers[$idx] ?? $rawAnswers[(string) $idx] ?? null;
                    $eval = $this->evaluateQuestionAnswer($question, $ans);
                    $normalizedLiveAnswers[] = $eval['normalized_answer'];
                    if ($eval['is_answered']) {
                        $answeredCount++;
                        if ($eval['is_correct']) {
                            $currentScore += $pts;
                        }
                    }
                }

                $existing = DB::table('quiz_live_sessions')
                    ->where('quiz_id', $quiz->id)
                    ->where('student_id', $student->id)
                    ->first();

                $telemetryEnvelope = [
                    'answers' => $normalizedLiveAnswers,
                    'question_order' => is_array($input['question_order'] ?? null)
                        ? array_values(array_map('intval', $input['question_order']))
                        : [],
                    'cursor_x' => isset($input['cursor_x']) ? round(max(0, min(100, (float) $input['cursor_x'])), 2) : 50.0,
                    'cursor_y' => isset($input['cursor_y']) ? round(max(0, min(100, (float) $input['cursor_y'])), 2) : 50.0,
                    'cursor_trail' => is_array($input['cursor_trail'] ?? null)
                        ? array_slice($input['cursor_trail'], -12)
                        : [],
                    'hovered_element' => isset($input['hovered_element']) ? (string) $input['hovered_element'] : null,
                    'scroll_y_pct' => isset($input['scroll_y_pct']) ? round(max(0, min(100, (float) $input['scroll_y_pct'])), 2) : 0.0,
                    'device_label' => isset($input['device_label']) ? (string) $input['device_label'] : null,
                    'viewport_width' => isset($input['viewport_width']) ? (int) $input['viewport_width'] : 1366,
                    'viewport_height' => isset($input['viewport_height']) ? (int) $input['viewport_height'] : 768,
                    'is_fullscreen' => array_key_exists('is_fullscreen', $input) ? (bool) $input['is_fullscreen'] : true,
                    'is_blocked' => array_key_exists('is_blocked', $input) ? (bool) $input['is_blocked'] : false,
                    'interruption_title' => isset($input['interruption_title']) ? (string) $input['interruption_title'] : null,
                    'ip_address' => $request->ip(),
                ];

                $payload = [
                    'status' => 'in_progress',
                    'current_question' => (int) ($input['current_question'] ?? max(1, $answeredCount)),
                    'answered_count' => $answeredCount,
                    'total_questions' => count($questions),
                    'current_score' => $currentScore,
                    'max_score' => max(1, $maxScore),
                    'answers' => json_encode($telemetryEnvelope),
                    'cheating_attempts_count' => (int) ($input['cheating_attempts_count'] ?? 0),
                    'time_remaining_seconds' => isset($input['time_remaining_seconds']) ? (int) $input['time_remaining_seconds'] : null,
                    'last_active_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ];

                if ($existing) {
                    if ($existing->status !== 'submitted') {
                        DB::table('quiz_live_sessions')->where('id', $existing->id)->update($payload);
                    }
                } else {
                    $payload['quiz_id'] = $quiz->id;
                    $payload['student_id'] = $student->id;
                    $payload['started_at'] = Carbon::now();
                    $payload['created_at'] = Carbon::now();
                    DB::table('quiz_live_sessions')->insert($payload);
                }
            }
        } catch (\Throwable) {
            // Non-blocking
        }

        return response()->json(['status' => 'ok']);
    }

    public function showPdf(Request $request, Quiz $quiz): JsonResponse
    {
        $user = $request->user();
        abort_unless($user !== null, 401, 'Unauthenticated.');

        if ($user->role === 'student') {
            abort_unless($quiz->is_published, 404, 'Quiz not found or not published.');
            abort_unless($this->isStudentEligible($user, $quiz), 403, 'This quiz is not assigned to your section or account.');
        }

        $this->repairQuizQuestionsIfNeeded($quiz);

        $cleanPdfText = !empty($quiz->reference_pdf_text)
            ? implode("\n\n", $this->ai->extractCleanSentences((string) $quiz->reference_pdf_text))
            : null;

        return response()->json([
            'id' => $quiz->id,
            'title' => $quiz->title,
            'subject' => $quiz->subject,
            'topic' => $quiz->topic,
            'instructions' => $quiz->instructions,
            'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
            'question_count' => count($quiz->questions ?? []),
            'reference_pdf_name' => $quiz->reference_pdf_name ?? null,
            'reference_pdf_text' => $cleanPdfText ?: null,
            'reference_pdf_data' => $quiz->reference_pdf_data ?? null,
            'has_pdf_data' => !empty($quiz->reference_pdf_data),
        ]);
    }

    public function logViolation(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'student');
        $student = $request->user();

        $input = $request->validate([
            'violation_type' => ['required', 'string', 'max:50'],
            'details' => ['nullable', 'string', 'max:255'],
        ]);

        SecurityLog::create([
            'user_id' => $student->id,
            'event_type' => 'exam_proctor_violation',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'details' => [
                'quiz_id' => $quiz->id,
                'quiz_title' => $quiz->title,
                'violation_type' => $input['violation_type'],
                'details' => $input['details'] ?? '',
                'timestamp' => Carbon::now()->toIso8601String(),
            ],
        ]);

        return response()->json(['status' => 'logged']);
    }

    public function submit(Request $request, Quiz $quiz): JsonResponse
    {
        $this->requireRole($request, 'student');
        abort_unless($quiz->is_published, 404, 'Quiz not found or not published.');
        
        $student = $request->user();
        abort_unless($this->isStudentEligible($student, $quiz), 403, 'This quiz is not assigned to your section or account.');

        $this->repairQuizQuestionsIfNeeded($quiz);

        $questions = $quiz->questions ?? [];
        $validated = $request->validate([
            'answers' => ['required', 'array', 'size:'.count($questions)],
            'cheating_attempts_count' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'violations' => ['sometimes', 'nullable', 'array'],
            'started_at' => ['sometimes', 'nullable', 'string'],
        ]);

        if (! array_is_list($validated['answers'])) {
            return response()->json(['message' => 'Answers must be submitted in question order.'], 422);
        }

        if (QuizAttempt::where('quiz_id', $quiz->id)->where('student_id', $student->id)->exists()) {
            return response()->json(['message' => 'This quiz has already been submitted.'], 409);
        }

        $rawSubmittedAnswers = array_values($validated['answers']);
        $answers = [];
        $score = 0;
        $maxScore = 0;
        $answeredCount = 0;
        foreach ($questions as $index => $question) {
            $pts = isset($question['points']) && is_numeric($question['points']) ? max(1, (int) $question['points']) : 1;
            $maxScore += $pts;
            $eval = $this->evaluateQuestionAnswer($question, $rawSubmittedAnswers[$index] ?? null);
            $answers[$index] = $eval['normalized_answer'];
            if ($eval['is_answered']) {
                $answeredCount++;
                if ($eval['is_correct']) {
                    $score += $pts;
                }
            }
        }
        $maxScore = max(1, $maxScore);
        $percentage = round(($score / $maxScore) * 100, 2);

        $recommendation = $this->ai->recommend(
            $quiz->topic,
            $score,
            $maxScore,
            $questions,
            $answers,
            $quiz->reference_pdf_text ?? null,
            $quiz->reference_pdf_name ?? null,
            $quiz->reference_pdf_data ?? null,
        );
        $cheatingCount = (int) ($validated['cheating_attempts_count'] ?? 0);
        $violations = $validated['violations'] ?? [];

        try {
            $attempt = DB::transaction(fn () => QuizAttempt::create([
                'quiz_id' => $quiz->id,
                'student_id' => $student->id,
                'answers' => $answers,
                'score' => $score,
                'max_score' => $maxScore,
                'percentage' => $percentage,
                'cheating_attempts_count' => $cheatingCount,
                'violations' => $violations,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'started_at' => !empty($validated['started_at']) ? Carbon::parse($validated['started_at']) : Carbon::now()->subMinutes(10),
                'completed_at' => Carbon::now(),
                'recommendation' => $recommendation,
            ]));
        } catch (QueryException $error) {
            if (QuizAttempt::where('quiz_id', $quiz->id)->where('student_id', $student->id)->exists()) {
                return response()->json(['message' => 'This quiz has already been submitted.'], 409);
            }
            throw $error;
        }

        try {
            if (Schema::hasTable('quiz_live_sessions')) {
                DB::table('quiz_live_sessions')->updateOrInsert(
                    ['quiz_id' => $quiz->id, 'student_id' => $student->id],
                    [
                        'status' => 'submitted',
                        'answered_count' => $answeredCount,
                        'total_questions' => count($questions),
                        'current_score' => $score,
                        'max_score' => $maxScore,
                        'answers' => json_encode($answers),
                        'cheating_attempts_count' => $cheatingCount,
                        'time_remaining_seconds' => 0,
                        'completed_at' => Carbon::now(),
                        'last_active_at' => Carbon::now(),
                        'updated_at' => Carbon::now(),
                    ]
                );
            }
        } catch (\Throwable) {
            // Non-blocking
        }

        // If cheating was detected, also generate a high-priority SecurityLog
        if ($cheatingCount > 0) {
            SecurityLog::create([
                'user_id' => $student->id,
                'event_type' => 'quiz_integrity_violation',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'details' => [
                    'quiz_id' => $quiz->id,
                    'quiz_title' => $quiz->title,
                    'cheating_attempts_count' => $cheatingCount,
                    'violations_sample' => array_slice($violations, 0, 5),
                    'score' => $score,
                    'max_score' => count($questions),
                ],
            ]);
        }

        return response()->json([
            'attempt' => [
                'score' => $attempt->score,
                'max_score' => $attempt->max_score,
                'percentage' => $attempt->percentage,
                'cheating_attempts_count' => $attempt->cheating_attempts_count,
                'recommendation' => $attempt->recommendation,
                'allow_review' => (bool) $quiz->allow_review,
                'answers' => $answers,
                'review_questions' => $quiz->allow_review
                    ? $this->buildReviewQuestions($questions, $answers)
                    : [],
            ]
        ], 201);
    }

    /**
     * Refresh legacy attempt recommendations so:
     * 1) Perfect scores have zero improvement steps or external links, and
     * 2) Non-perfect scores on PDF quizzes provide Learning Ideas derived directly from the attached PDF.
     */
    private function refreshAttemptRecommendationIfNeeded(Quiz $quiz, ?QuizAttempt $attempt): void
    {
        if (! $attempt) {
            return;
        }

        $score = (int) $attempt->score;
        $maxScore = max(1, (int) $attempt->max_score);
        $rec = is_array($attempt->recommendation) ? $attempt->recommendation : [];
        $source = (string) ($rec['source'] ?? '');
        $hasPdf = ! empty($quiz->reference_pdf_name) || ! empty($quiz->reference_pdf_text) || ! empty($quiz->reference_pdf_data);

        // Case 1: Perfect score should have no improvement steps or links
        if ($score >= $maxScore) {
            if (! empty($rec['action_steps']) || ! empty($rec['references']) || ! empty($rec['focus_topics']) || ! in_array($source, ['perfect', 'pdf-perfect'], true)) {
                $updated = [
                    'summary' => 'Perfect Score! You answered every question correctly and demonstrated 100% mastery of this assessment. No further study improvements or reference links are needed.',
                    'focus_topics' => [],
                    'action_steps' => [],
                    'references' => [],
                    'source' => $hasPdf ? 'pdf-perfect' : 'perfect',
                ];
                $attempt->recommendation = $updated;
                try {
                    $attempt->save();
                } catch (\Throwable) {
                    // Non-blocking
                }
            }
            return;
        }

        // Case 2: Non-perfect score with an attached PDF whose recommendation was generated before pdf-learning-ideas
        if ($hasPdf && ! in_array($source, ['pdf-learning-ideas', 'gemini-pdf'], true)) {
            $updated = $this->ai->recommend(
                (string) $quiz->topic,
                $score,
                $maxScore,
                $quiz->questions ?? [],
                is_array($attempt->answers) ? $attempt->answers : [],
                $quiz->reference_pdf_text ?? null,
                $quiz->reference_pdf_name ?? null,
                null, // Fast local PDF learning ideas refresh on read
            );
            $attempt->recommendation = $updated;
            try {
                $attempt->save();
            } catch (\Throwable) {
                // Non-blocking
            }
        }
    }

    /**
     * Build detailed question review payload when allow_review is enabled.
     *
     * @param array<int, array<string, mixed>> $questions
     * @param array<int, mixed> $answers
     * @return array<int, array<string, mixed>>
     */
    private function buildReviewQuestions(array $questions, array $answers): array
    {
        $review = [];
        foreach (array_values($questions) as $idx => $question) {
            $qType = (string) ($question['type'] ?? 'multiple_choice');
            $eval = $this->evaluateQuestionAnswer($question, $answers[$idx] ?? null);
            $correctIdx = (int) ($question['correct_index'] ?? 0);
            $options = $qType === 'true_false'
                ? ['True', 'False']
                : array_values(is_array($question['options'] ?? null) ? $question['options'] : []);
            $correctIndices = is_array($question['correct_indices'] ?? null) && !empty($question['correct_indices'])
                ? array_values(array_map('intval', $question['correct_indices']))
                : [$correctIdx];
            $correctAnswer = (string) ($question['correct_answer'] ?? ($options[$correctIdx] ?? ''));

            $review[] = [
                'type' => $qType,
                'prompt' => (string) ($question['prompt'] ?? ''),
                'options' => $options,
                'points' => isset($question['points']) && is_numeric($question['points']) ? max(1, (int) $question['points']) : 1,
                'skill' => (string) ($question['skill'] ?? 'Core Concepts'),
                'correct_index' => $correctIdx,
                'correct_indices' => $correctIndices,
                'correct_answer' => $correctAnswer,
                'student_answer' => $eval['normalized_answer'],
                'is_correct' => $eval['is_correct'],
            ];
        }
        return $review;
    }

    /**
     * Normalize question array from Quiz Editor Modal across all 5 question types.
     *
     * @param array<int, array<string, mixed>> $questions
     * @return array<int, array<string, mixed>>
     */
    private function normalizeQuizQuestions(array $questions): array
    {
        $validTypes = ['multiple_choice', 'identification', 'true_false', 'multiple_answer', 'essay'];
        $normalized = [];

        foreach (array_values($questions) as $q) {
            $type = in_array($q['type'] ?? '', $validTypes, true) ? (string) $q['type'] : 'multiple_choice';
            $prompt = trim((string) ($q['prompt'] ?? ''));
            $skill = trim((string) ($q['skill'] ?? 'General Knowledge')) ?: 'General Knowledge';
            $points = isset($q['points']) && is_numeric($q['points']) ? max(1, min(100, (int) $q['points'])) : 1;

            if ($type === 'true_false') {
                $cIdx = ((int) ($q['correct_index'] ?? 0)) === 1 ? 1 : 0;
                $normalized[] = [
                    'type' => 'true_false',
                    'prompt' => $prompt,
                    'skill' => $skill,
                    'points' => $points,
                    'options' => ['True', 'False'],
                    'correct_index' => $cIdx,
                    'correct_indices' => [$cIdx],
                    'correct_answer' => $cIdx === 1 ? 'False' : 'True',
                ];
                continue;
            }

            if ($type === 'identification') {
                $ans = trim((string) ($q['correct_answer'] ?? ($q['options'][0] ?? '')));
                $normalized[] = [
                    'type' => 'identification',
                    'prompt' => $prompt,
                    'skill' => $skill,
                    'points' => $points,
                    'options' => [$ans, $ans],
                    'correct_index' => 0,
                    'correct_indices' => [0],
                    'correct_answer' => $ans,
                ];
                continue;
            }

            if ($type === 'essay') {
                $rubric = trim((string) ($q['correct_answer'] ?? ($q['options'][0] ?? '')));
                $normalized[] = [
                    'type' => 'essay',
                    'prompt' => $prompt,
                    'skill' => $skill,
                    'points' => $points,
                    'options' => [$rubric ?: 'Essay', 'Essay'],
                    'correct_index' => 0,
                    'correct_indices' => [0],
                    'correct_answer' => $rubric,
                ];
                continue;
            }

            $rawOpts = is_array($q['options'] ?? null) ? array_values(array_map(fn ($o) => trim((string) $o), $q['options'])) : [];
            while (count($rawOpts) < 2) {
                $rawOpts[] = 'Option '.chr(65 + count($rawOpts));
            }
            $options = array_slice($rawOpts, 0, 6);
            $correctIdx = isset($q['correct_index']) && is_numeric($q['correct_index'])
                ? max(0, min(count($options) - 1, (int) $q['correct_index']))
                : 0;
            $rawIndices = is_array($q['correct_indices'] ?? null) && !empty($q['correct_indices'])
                ? array_values(array_unique(array_filter(
                    array_map('intval', $q['correct_indices']),
                    fn (int $i) => $i >= 0 && $i < count($options)
                )))
                : [$correctIdx];
            sort($rawIndices);
            if ($rawIndices === []) {
                $rawIndices = [$correctIdx];
            }

            $normalized[] = [
                'type' => $type,
                'prompt' => $prompt,
                'skill' => $skill,
                'points' => $points,
                'options' => $options,
                'correct_index' => $type === 'multiple_answer' ? $rawIndices[0] : $correctIdx,
                'correct_indices' => $type === 'multiple_answer' ? $rawIndices : [$correctIdx],
                'correct_answer' => $options[$correctIdx] ?? '',
            ];
        }

        return $normalized;
    }

    /**
     * Evaluate a student's answer for any question type (multiple_choice, identification, true_false, multiple_answer, essay).
     *
     * @param array<string, mixed> $question
     * @return array{is_answered: bool, is_correct: bool, normalized_answer: mixed}
     */
    private function evaluateQuestionAnswer(array $question, mixed $rawAnswer): array
    {
        $type = (string) ($question['type'] ?? 'multiple_choice');

        if ($type === 'identification') {
            $studentText = is_string($rawAnswer)
                ? trim($rawAnswer)
                : (is_numeric($rawAnswer) && (int) $rawAnswer !== -1 ? trim((string) $rawAnswer) : '');
            $isAnswered = $studentText !== '';
            $expectedRaw = (string) ($question['correct_answer'] ?? ($question['options'][0] ?? ''));
            $variants = array_filter(array_map(
                fn (string $s) => strtolower(preg_replace('/\s+/', ' ', trim($s, " \t\n\r\0\x0B.,;:?!\"'")) ?? ''),
                preg_split('/[,|\/]/', $expectedRaw) ?: [$expectedRaw]
            ));
            $normalizedStudent = strtolower(preg_replace('/\s+/', ' ', trim($studentText, " \t\n\r\0\x0B.,;:?!\"'")) ?? '');
            $isCorrect = $isAnswered && $normalizedStudent !== '' && in_array($normalizedStudent, $variants, true);

            return [
                'is_answered' => $isAnswered,
                'is_correct' => $isCorrect,
                'normalized_answer' => $studentText,
            ];
        }

        if ($type === 'essay') {
            $studentText = is_string($rawAnswer)
                ? trim($rawAnswer)
                : '';
            $isAnswered = $studentText !== '';
            $wordCount = count(array_filter(preg_split('/\s+/', $studentText) ?: []));
            $isCorrect = $isAnswered && ($wordCount >= 3 || strlen($studentText) >= 12);

            return [
                'is_answered' => $isAnswered,
                'is_correct' => $isCorrect,
                'normalized_answer' => $studentText,
            ];
        }

        if ($type === 'multiple_answer') {
            $selected = [];
            if (is_array($rawAnswer)) {
                foreach ($rawAnswer as $val) {
                    if (is_numeric($val) && (int) $val >= 0) {
                        $selected[] = (int) $val;
                    }
                }
            } elseif (is_numeric($rawAnswer) && (int) $rawAnswer >= 0) {
                $selected[] = (int) $rawAnswer;
            }
            $selected = array_values(array_unique($selected));
            sort($selected);

            $expected = is_array($question['correct_indices'] ?? null) && !empty($question['correct_indices'])
                ? array_values(array_unique(array_map('intval', $question['correct_indices'])))
                : [(int) ($question['correct_index'] ?? 0)];
            sort($expected);

            $isAnswered = count($selected) > 0;
            $isCorrect = $isAnswered && $selected === $expected;

            return [
                'is_answered' => $isAnswered,
                'is_correct' => $isCorrect,
                'normalized_answer' => $selected,
            ];
        }

        // Default: multiple_choice & true_false
        $choiceIdx = ($rawAnswer !== null && is_numeric($rawAnswer)) ? (int) $rawAnswer : -1;
        $isAnswered = $choiceIdx >= 0;
        $correctIdx = (int) ($question['correct_index'] ?? 0);

        return [
            'is_answered' => $isAnswered,
            'is_correct' => $isAnswered && $choiceIdx === $correctIdx,
            'normalized_answer' => $choiceIdx,
        ];
    }

    /**
     * Build active live sessions list for Formative quizzes.
     *
     * @return array<int, array<string, mixed>>
     */
    private function buildLiveSessionsList(Quiz $quiz): array
    {
        try {
            $this->ensurePdfColumns();
            if (! Schema::hasTable('quiz_live_sessions')) {
                return [];
            }

            $submittedIds = QuizAttempt::where('quiz_id', $quiz->id)->pluck('student_id')->map(fn ($id) => (int) $id)->all();

            $rows = DB::table('quiz_live_sessions')
                ->join('users', 'quiz_live_sessions.student_id', '=', 'users.id')
                ->where('quiz_live_sessions.quiz_id', $quiz->id)
                ->where('quiz_live_sessions.status', 'in_progress')
                ->orderByDesc('quiz_live_sessions.last_active_at')
                ->select([
                    'quiz_live_sessions.*',
                    'users.name as student_name',
                    'users.email as student_email',
                    'users.section as student_section',
                    'users.grade as student_grade',
                ])
                ->get();

            $result = [];
            foreach ($rows as $row) {
                if (in_array((int) $row->student_id, $submittedIds, true)) {
                    continue;
                }
                $totalQ = max(1, (int) ($row->total_questions ?: count($quiz->questions ?? [])));
                $answered = max(0, (int) $row->answered_count);
                $progressPct = round(($answered / $totalQ) * 100);

                $decoded = is_string($row->answers) ? json_decode($row->answers, true) : (is_array($row->answers) ? $row->answers : []);
                $liveAnswers = [];
                $questionOrder = [];
                $cursorX = 50.0;
                $cursorY = 50.0;
                $cursorTrail = [];
                $hoveredElement = null;
                $scrollYPct = 0.0;
                $deviceLabel = 'Desktop Browser';
                $viewportWidth = 1366;
                $viewportHeight = 768;
                $isFullscreen = true;
                $isBlocked = false;
                $interruptionTitle = null;
                $ipAddress = null;

                if (is_array($decoded)) {
                    if (array_key_exists('answers', $decoded) && is_array($decoded['answers'])) {
                        $liveAnswers = array_values($decoded['answers']);
                        $questionOrder = is_array($decoded['question_order'] ?? null) ? array_values(array_map('intval', $decoded['question_order'])) : [];
                        $cursorX = isset($decoded['cursor_x']) ? (float) $decoded['cursor_x'] : 50.0;
                        $cursorY = isset($decoded['cursor_y']) ? (float) $decoded['cursor_y'] : 50.0;
                        $cursorTrail = is_array($decoded['cursor_trail'] ?? null) ? $decoded['cursor_trail'] : [];
                        $hoveredElement = isset($decoded['hovered_element']) ? (string) $decoded['hovered_element'] : null;
                        $scrollYPct = isset($decoded['scroll_y_pct']) ? (float) $decoded['scroll_y_pct'] : 0.0;
                        $deviceLabel = !empty($decoded['device_label']) ? (string) $decoded['device_label'] : 'Desktop Browser';
                        $viewportWidth = isset($decoded['viewport_width']) ? (int) $decoded['viewport_width'] : 1366;
                        $viewportHeight = isset($decoded['viewport_height']) ? (int) $decoded['viewport_height'] : 768;
                        $isFullscreen = array_key_exists('is_fullscreen', $decoded) ? (bool) $decoded['is_fullscreen'] : true;
                        $isBlocked = array_key_exists('is_blocked', $decoded) ? (bool) $decoded['is_blocked'] : false;
                        $interruptionTitle = isset($decoded['interruption_title']) ? (string) $decoded['interruption_title'] : null;
                        $ipAddress = isset($decoded['ip_address']) ? (string) $decoded['ip_address'] : null;
                    } elseif (array_is_list($decoded)) {
                        $liveAnswers = array_values($decoded);
                    }
                }

                $result[] = [
                    'id' => (int) $row->id,
                    'student_id' => (int) $row->student_id,
                    'student_name' => $row->student_name ?? 'Unknown Student',
                    'student_email' => $row->student_email ?? '',
                    'student_section' => $row->student_section ?? 'N/A',
                    'student_grade' => $row->student_grade ?? '',
                    'status' => 'in_progress',
                    'current_question' => max(1, (int) $row->current_question),
                    'answered_count' => $answered,
                    'total_questions' => $totalQ,
                    'progress_percentage' => $progressPct,
                    'current_score' => (int) $row->current_score,
                    'max_score' => max(1, (int) $row->max_score),
                    'cheating_attempts_count' => (int) ($row->cheating_attempts_count ?? 0),
                    'time_remaining_seconds' => $row->time_remaining_seconds !== null ? (int) $row->time_remaining_seconds : null,
                    'answers' => $liveAnswers,
                    'question_order' => $questionOrder,
                    'cursor_x' => $cursorX,
                    'cursor_y' => $cursorY,
                    'cursor_trail' => $cursorTrail,
                    'hovered_element' => $hoveredElement,
                    'scroll_y_pct' => $scrollYPct,
                    'device_label' => $deviceLabel,
                    'viewport_width' => $viewportWidth,
                    'viewport_height' => $viewportHeight,
                    'is_fullscreen' => $isFullscreen,
                    'is_blocked' => $isBlocked,
                    'interruption_title' => $interruptionTitle,
                    'ip_address' => $ipAddress,
                    'started_at' => $row->started_at,
                    'last_active_at' => $row->last_active_at,
                ];
            }

            return $result;
        } catch (\Throwable) {
            return [];
        }
    }

    public function sections(): JsonResponse
    {
        $sections = Section::query()->orderBy('grade')->orderBy('name')->get();
        return response()->json(['sections' => $sections]);
    }

    private function isStudentEligible(User $student, Quiz $quiz): bool
    {
        // Enforce Academic Department Data Isolation (e.g. CIT quizzes only visible to CIT students)
        $quizDept = $quiz->department ?: config('lms.default_department', 'CIT');
        $studentDept = $student->departmentCode();
        if (strtoupper($quizDept) !== strtoupper($studentDept)) {
            return false;
        }

        $targetType = $quiz->target_type ?? 'all';
        if ($targetType === 'all') {
            return true;
        }

        if ($targetType === 'section') {
            $sections = $quiz->target_sections ?? [];
            if (empty($sections)) {
                return true;
            }
            $studentSection = (string) $student->section;
            $studentGradeSection = $student->grade ? "Grade {$student->grade} - {$student->section}" : $student->section;
            $studentGradeSectionAlt = $student->grade ? "{$student->grade} - {$student->section}" : $student->section;

            return in_array($studentSection, $sections, true)
                || in_array($studentGradeSection, $sections, true)
                || in_array($studentGradeSectionAlt, $sections, true);
        }

        if ($targetType === 'individual') {
            $studentIds = array_map('intval', $quiz->target_student_ids ?? []);
            if (empty($studentIds)) {
                return true;
            }
            return in_array((int) $student->id, $studentIds, true);
        }

        return true;
    }

    private function requireRole(Request $request, string $role): void
    {
        $userRole = $request->user()?->role;
        $matches = ($userRole === $role);
        if ($role === 'principal' && $userRole === 'dean') $matches = true;
        if ($role === 'dean' && $userRole === 'principal') $matches = true;
        if ($userRole === 'developer') $matches = true;

        abort_unless($matches, 403, 'Your account does not have access to this area.');
    }


    /**
     * Extract PDF filename, readable text, and base64 data from either multipart file upload or JSON payload.
     *
     * @param array<string, mixed> $input
     * @return array{name: ?string, text: ?string, base64: ?string}
     */
    private function extractPdfInput(Request $request, array $input): array
    {
        $name = isset($input['pdf_name']) && is_string($input['pdf_name']) && trim($input['pdf_name']) !== ''
            ? trim($input['pdf_name'])
            : null;
        $rawText = isset($input['pdf_text']) && is_string($input['pdf_text']) && trim($input['pdf_text']) !== ''
            ? trim($input['pdf_text'])
            : null;
        $base64 = isset($input['pdf_base64']) && is_string($input['pdf_base64']) && trim($input['pdf_base64']) !== ''
            ? trim($input['pdf_base64'])
            : null;

        if ($base64 !== null) {
            $base64 = preg_replace('/^data:application\/pdf;base64,/i', '', $base64) ?: null;
        }

        // Sanitize any client-side extracted text so binary/encoding fragments never pollute generation
        $cleanClientSentences = $rawText !== null ? $this->ai->extractCleanSentences($rawText) : [];
        $text = $cleanClientSentences !== [] ? implode(' ', $cleanClientSentences) : null;

        $file = $request->file('pdf') ?? $request->file('pdf_file');
        if ($file && $file->isValid()) {
            $name = $name ?: $file->getClientOriginalName();
            $binary = @file_get_contents($file->getRealPath());
            if (is_string($binary) && $binary !== '') {
                $base64 = $base64 ?: base64_encode($binary);
                $extracted = $this->ai->extractTextFromPdfBinary($binary);
                if ($extracted !== '') {
                    $text = $text ? ($text."\n".$extracted) : $extracted;
                }
            }
        } elseif ($base64 !== null) {
            $binary = @base64_decode($base64, true);
            if (is_string($binary) && $binary !== '') {
                $extracted = $this->ai->extractTextFromPdfBinary($binary);
                if ($extracted !== '') {
                    $text = $text ? ($text."\n".$extracted) : $extracted;
                }
            }
        }

        if ($text !== null) {
            $verifiedSentences = $this->ai->extractCleanSentences($text);
            $text = $verifiedSentences !== [] ? implode(' ', $verifiedSentences) : null;
        }

        return [
            'name' => $name,
            'text' => $text,
            'base64' => $base64,
        ];
    }

    /**
     * Automatically repairs any previously saved quiz whose questions or options
     * contain compressed PDF binary stream noise (e.g. "\$ MW _ Z r lKEfv...")
     * or whose answers are all stuck on Option A (correct_index === 0).
     */
    private function repairQuizQuestionsIfNeeded(Quiz $quiz): void
    {
        try {
            $this->ensurePdfColumns();
            $questions = is_array($quiz->questions) ? $quiz->questions : [];
            $dirty = false;

            if (empty($quiz->reference_pdf_name) && !empty($quiz->instructions)) {
                if (preg_match('/attached PDF handout \(([^)]+\.pdf)\)/i', (string) $quiz->instructions, $m)) {
                    $quiz->reference_pdf_name = trim($m[1]);
                    $dirty = true;
                }
            }

            if (!empty($quiz->reference_pdf_text)) {
                $cleanSentences = $this->ai->extractCleanSentences((string) $quiz->reference_pdf_text);
                $cleanText = $cleanSentences !== [] ? implode(' ', $cleanSentences) : null;
                if ($cleanText !== $quiz->reference_pdf_text) {
                    $quiz->reference_pdf_text = $cleanText;
                    $dirty = true;
                }
            }

            if ($this->ai->hasCorruptedQuestions($questions)) {
                $count = max(1, count($questions));
                $generated = $this->ai->generateQuiz(
                    (string) ($quiz->subject ?: 'General'),
                    (string) ($quiz->topic ?: $quiz->title ?: 'Course Material'),
                    $count,
                    'medium',
                    $quiz->reference_pdf_text,
                    $quiz->reference_pdf_data ?? null,
                    $quiz->reference_pdf_name ?? null,
                );
                $quiz->questions = $generated['questions'];
                $dirty = true;
            } elseif ($this->ai->hasAllAnswersStuckOnFirstOption($questions)) {
                $quiz->questions = $this->ai->randomizeOptionsPreservingCorrectAnswer($questions);
                $dirty = true;
            }

            if ($dirty) {
                $quiz->save();
            }
        } catch (\Throwable) {
            // Non-blocking safeguard
        }
    }

    private function ensurePdfColumns(): bool
    {
        try {
            if (! Schema::hasColumn('quizzes', 'reference_pdf_name')) {
                Schema::table('quizzes', function (Blueprint $table): void {
                    $table->string('reference_pdf_name')->nullable();
                    $table->longText('reference_pdf_text')->nullable();
                    $table->longText('reference_pdf_data')->nullable();
                });
            } elseif (! Schema::hasColumn('quizzes', 'reference_pdf_data')) {
                Schema::table('quizzes', function (Blueprint $table): void {
                    $table->longText('reference_pdf_data')->nullable();
                });
            }
            if (! Schema::hasColumn('quizzes', 'quiz_type')) {
                Schema::table('quizzes', function (Blueprint $table): void {
                    $table->string('quiz_type')->default('formative');
                });
            }
            if (! Schema::hasTable('quiz_live_sessions')) {
                Schema::create('quiz_live_sessions', function (Blueprint $table): void {
                    $table->id();
                    $table->foreignId('quiz_id')->constrained('quizzes')->cascadeOnDelete();
                    $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
                    $table->string('status')->default('in_progress');
                    $table->unsignedInteger('current_question')->default(1);
                    $table->unsignedInteger('answered_count')->default(0);
                    $table->unsignedInteger('total_questions')->default(0);
                    $table->unsignedInteger('current_score')->default(0);
                    $table->unsignedInteger('max_score')->default(0);
                    $table->json('answers')->nullable();
                    $table->unsignedInteger('cheating_attempts_count')->default(0);
                    $table->integer('time_remaining_seconds')->nullable();
                    $table->timestamp('started_at')->nullable();
                    $table->timestamp('last_active_at')->nullable();
                    $table->timestamp('completed_at')->nullable();
                    $table->timestamps();
                    $table->unique(['quiz_id', 'student_id']);
                });
            } elseif (! Schema::hasColumn('quiz_live_sessions', 'answers')) {
                Schema::table('quiz_live_sessions', function (Blueprint $table): void {
                    $table->json('answers')->nullable()->after('total_questions');
                });
            }
            return Schema::hasColumn('quizzes', 'reference_pdf_name');
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array<string, mixed> */
    private function teacherQuizPayload(Quiz $quiz): array
    {
        $cleanPdfText = !empty($quiz->reference_pdf_text)
            ? implode(' ', $this->ai->extractCleanSentences((string) $quiz->reference_pdf_text))
            : null;

        return [
            'id' => $quiz->id,
            'title' => $quiz->title,
            'subject' => $quiz->subject,
            'topic' => $quiz->topic,
            'instructions' => $quiz->instructions,
            'reference_pdf_name' => $quiz->reference_pdf_name ?? null,
            'reference_pdf_text' => $cleanPdfText ?: null,
            'has_pdf_data' => !empty($quiz->reference_pdf_data),
            'question_count' => count($quiz->questions ?? []),
            'is_published' => (bool) $quiz->is_published,
            'allow_review' => (bool) $quiz->allow_review,
            'quiz_type' => ($quiz->quiz_type ?? 'formative') === 'summative' ? 'summative' : 'formative',
            'generated_by_ai' => (bool) $quiz->generated_by_ai,
            'target_type' => $quiz->target_type ?? 'all',
            'target_sections' => $quiz->target_sections ?? [],
            'target_student_ids' => $quiz->target_student_ids ?? [],
            'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
            'shuffle_questions' => (bool) ($quiz->shuffle_questions ?? false),
            'attempts_count' => $quiz->attempts_count ?? 0,
            'average' => round((float) ($quiz->attempts_avg_percentage ?? 0), 1),
            'questions' => $quiz->questions ?? [],
        ];
    }
}

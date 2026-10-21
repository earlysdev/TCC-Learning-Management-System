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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
        }
        $quizzes = $query->withCount('attempts')->withAvg('attempts', 'percentage')->latest()->get();

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
            'count' => ['nullable', 'integer', 'between:1,50'],
            'instructions' => ['nullable', 'string'],
            'time_limit_minutes' => ['nullable', 'integer', 'between:1,300'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'questions' => ['sometimes', 'array', 'min:1'],
        ]);

        $questionCount = (int) ($input['count'] ?? 3);
        $questions = $input['questions'] ?? array_map(fn (int $i) => [
            'prompt' => '',
            'skill' => $input['topic'],
            'points' => 1,
            'options' => ['', '', '', ''],
            'correct_index' => 0,
        ], range(1, max(1, $questionCount)));

        $title = !empty(trim($input['title'] ?? ''))
            ? trim($input['title'])
            : ($input['topic'] . ' Assessment');

        $quiz = Quiz::create([
            'teacher_id' => $request->user()->id,
            'title' => $title,
            'subject' => $input['subject'],
            'topic' => $input['topic'],
            'instructions' => $input['instructions'] ?? 'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.',
            'questions' => $questions,
            'generated_by_ai' => false,
            'target_type' => $input['target_type'] ?? 'all',
            'target_sections' => $input['target_sections'] ?? null,
            'time_limit_minutes' => $input['time_limit_minutes'] ?? 15,
        ]);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()->id,
            'action' => 'create_quiz',
            'description' => "Created manual quiz \"{$quiz->title}\" ({$quiz->subject})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['quiz' => $this->teacherQuizPayload($quiz)], 201);
    }

    public function generate(Request $request): JsonResponse
    {
        $this->requireRole($request, 'teacher');
        $input = $request->validate([
            'subject' => ['required', 'string', 'max:100'],
            'topic' => ['required', 'string', 'max:120'],
            'count' => ['required', 'integer', 'between:3,10'],
            'difficulty' => ['required', 'in:easy,medium,challenging'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
        ]);
        $generated = $this->ai->generateQuiz($input['subject'], $input['topic'], $input['count'], $input['difficulty']);
        $quiz = Quiz::create([
            'teacher_id' => $request->user()->id,
            'title' => $input['topic'].' — '.$input['difficulty'].' practice',
            'subject' => $input['subject'],
            'topic' => $input['topic'],
            'instructions' => 'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.',
            'questions' => $generated['questions'],
            'generated_by_ai' => $generated['source'] === 'gemini',
            'target_type' => $input['target_type'] ?? 'all',
            'target_sections' => $input['target_sections'] ?? null,
            'time_limit_minutes' => 15,
        ]);

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
            'instructions' => ['sometimes', 'string'],
            'time_limit_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,300'],
            'shuffle_questions' => ['sometimes', 'boolean'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'target_student_ids' => ['sometimes', 'nullable', 'array'],
            'questions' => ['sometimes', 'array', 'min:1'],
            'questions.*.prompt' => ['required_with:questions', 'string'],
            'questions.*.options' => ['required_with:questions', 'array', 'min:2', 'max:6'],
            'questions.*.correct_index' => ['required_with:questions', 'integer', 'min:0'],
            'questions.*.points' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
            'questions.*.skill' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);

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
            'allow_review' => ['sometimes', 'boolean'],
            'target_type' => ['sometimes', 'in:all,section,individual'],
            'target_sections' => ['sometimes', 'nullable', 'array'],
            'target_student_ids' => ['sometimes', 'nullable', 'array'],
            'time_limit_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,300'],
            'shuffle_questions' => ['sometimes', 'boolean'],
        ]);
        
        $quiz->update($input);
        return response()->json(['quiz' => $this->teacherQuizPayload($quiz->fresh()->loadCount('attempts'))]);
    }

    public function submissions(Request $request, Quiz $quiz): JsonResponse
    {
        $user = $request->user();
        $isTeacher = $user->role === 'teacher' && $quiz->teacher_id === $user->id;
        $isAdmin = in_array($user->role, ['principal', 'dean', 'secretary']);
        abort_unless($isTeacher || $isAdmin, 403, 'Unauthorized to view submissions.');

        $attempts = QuizAttempt::where('quiz_id', $quiz->id)
            ->with(['student' => fn ($query) => $query->select('id', 'name', 'lrn', 'grade', 'section', 'email')])
            ->latest()
            ->get();

        return response()->json([
            'quiz' => [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'question_count' => count($quiz->questions ?? []),
                'target_type' => $quiz->target_type,
                'time_limit_minutes' => $quiz->time_limit_minutes,
            ],
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

        return response()->json(['quizzes' => $eligibleQuizzes->values()->map(function (Quiz $quiz): array {
            $attempt = $quiz->attempts->first();
            return [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'instructions' => $quiz->instructions,
                'question_count' => count($quiz->questions ?? []),
                'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
                'shuffle_questions' => (bool) ($quiz->shuffle_questions ?? false),
                'target_type' => $quiz->target_type,
                'attempted' => (bool) $attempt,
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

        $attempt = QuizAttempt::where('quiz_id', $quiz->id)->where('student_id', $student->id)->first();

        return response()->json([
            'quiz' => [
                'id' => $quiz->id,
                'title' => $quiz->title,
                'subject' => $quiz->subject,
                'topic' => $quiz->topic,
                'instructions' => $quiz->instructions,
                'time_limit_minutes' => $quiz->time_limit_minutes ?? 15,
                'shuffle_questions' => (bool) ($quiz->shuffle_questions ?? false),
                'questions' => collect($quiz->questions ?? [])->map(fn (array $question) => [
                    'prompt' => $question['prompt'],
                    'options' => $question['options'],
                    'points' => (int) ($question['points'] ?? 1),
                ])->values(),
            ],
            'attempt' => $attempt ? [
                'score' => $attempt->score,
                'max_score' => $attempt->max_score,
                'percentage' => $attempt->percentage,
                'cheating_attempts_count' => $attempt->cheating_attempts_count ?? 0,
                'violations' => $attempt->violations ?? [],
                'recommendation' => $attempt->recommendation,
            ] : null,
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

        $questions = $quiz->questions ?? [];
        $validated = $request->validate([
            'answers' => ['required', 'array', 'size:'.count($questions)],
            'answers.*' => ['required', 'integer', 'between:0,5'],
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

        $answers = array_values($validated['answers']);
        $score = 0;
        $maxScore = 0;
        foreach ($questions as $index => $question) {
            $pts = isset($question['points']) && is_numeric($question['points']) ? max(1, (int) $question['points']) : 1;
            $maxScore += $pts;
            if ($answers[$index] === $question['correct_index']) {
                $score += $pts;
            }
        }
        $maxScore = max(1, $maxScore);
        $percentage = round(($score / $maxScore) * 100, 2);

        $recommendation = $this->ai->recommend($quiz->topic, $score, $maxScore, $questions, $answers);
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
            ]
        ], 201);
    }

    public function sections(): JsonResponse
    {
        $sections = Section::query()->orderBy('grade')->orderBy('name')->get();
        return response()->json(['sections' => $sections]);
    }

    private function isStudentEligible(User $student, Quiz $quiz): bool
    {
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


    /** @return array<string, mixed> */
    private function teacherQuizPayload(Quiz $quiz): array
    {
        return [
            'id' => $quiz->id,
            'title' => $quiz->title,
            'subject' => $quiz->subject,
            'topic' => $quiz->topic,
            'instructions' => $quiz->instructions,
            'question_count' => count($quiz->questions ?? []),
            'is_published' => (bool) $quiz->is_published,
            'allow_review' => (bool) $quiz->allow_review,
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

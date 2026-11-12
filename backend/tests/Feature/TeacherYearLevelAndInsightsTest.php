<?php

namespace Tests\Feature;

use App\Models\LmsNotification;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TeacherYearLevelAndInsightsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\DemoSeeder::class);
    }

    public function test_secretary_can_assign_teacher_year_level_and_scope_quiz_visibility(): void
    {
        $secretary = User::where('role', 'secretary')->first()
            ?? User::factory()->create(['role' => 'secretary', 'department' => 'CIT', 'status' => 'active']);

        $studentYear1 = User::factory()->create([
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '1st Year',
            'section' => 'Block - 1A',
            'status' => 'active',
        ]);

        $studentYear2 = User::factory()->create([
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '2nd Year',
            'section' => 'Block - 2B',
            'status' => 'active',
        ]);

        // 1. Secretary creates a teacher assigned to handle 2nd Year
        $createRes = $this->actingAs($secretary)->postJson('/api/users', [
            'name' => 'Prof. Clara Mendoza',
            'first_name' => 'Clara',
            'last_name' => 'Mendoza',
            'email' => 'clara.mendoza@tcc.edu.ph',
            'password' => 'StrongPass123!',
            'role' => 'teacher',
            'grade' => '2nd Year',
        ]);

        $createRes->assertStatus(201);
        $createRes->assertJsonPath('data.role', 'teacher');
        $createRes->assertJsonPath('data.grade', '2nd Year');
        $createRes->assertJsonPath('email_dispatch.grade', '2nd Year');

        /** @var User $teacher */
        $teacher = User::where('email', 'clara.mendoza@tcc.edu.ph')->firstOrFail();

        // 2. Teacher roster endpoint returns only 2nd Year students
        $rosterRes = $this->actingAs($teacher)->getJson('/api/teacher/students');
        $rosterRes->assertOk();
        $rosterRes->assertJsonPath('handled_year_level', '2nd Year');
        $rosterIds = collect($rosterRes->json('data'))->pluck('id')->all();
        $this->assertContains($studentYear2->id, $rosterIds);
        $this->assertNotContains($studentYear1->id, $rosterIds);

        // 3. Teacher creates and publishes an "all" quiz — visibility must still stay restricted to 2nd Year
        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'department' => 'CIT',
            'title' => 'Data Structures & Queues',
            'subject' => 'IT 201 - Data Structures',
            'topic' => 'Queues',
            'questions' => [
                [
                    'prompt' => 'Which principle governs a queue?',
                    'skill' => 'Queue Operations',
                    'options' => ['FIFO', 'LIFO', 'Random', 'Priority-only'],
                    'correct_index' => 0,
                ],
            ],
            'is_published' => false,
            'target_type' => 'all',
        ]);

        $publishRes = $this->actingAs($teacher)->patchJson("/api/teacher/quizzes/{$quiz->id}/publish", [
            'is_published' => true,
            'audience' => ['type' => 'all'],
        ]);
        $publishRes->assertOk();

        // Notification dispatched ONLY to 2nd Year student, never 1st Year student
        $this->assertTrue(
            LmsNotification::where('user_id', $studentYear2->id)->where('type', 'quiz_published')->exists()
        );
        $this->assertFalse(
            LmsNotification::where('user_id', $studentYear1->id)->where('type', 'quiz_published')->exists()
        );

        // Student quizzes feed shows quiz to 2nd Year student and hides from 1st Year student
        $yr2Feed = $this->actingAs($studentYear2)->getJson('/api/student/quizzes');
        $yr2Feed->assertOk();
        $this->assertContains($quiz->id, collect($yr2Feed->json('quizzes'))->pluck('id')->all());

        $yr1Feed = $this->actingAs($studentYear1)->getJson('/api/student/quizzes');
        $yr1Feed->assertOk();
        $this->assertNotContains($quiz->id, collect($yr1Feed->json('quizzes'))->pluck('id')->all());

        // Direct quiz access is blocked with 403 for 1st Year student
        $this->actingAs($studentYear1)->getJson("/api/student/quizzes/{$quiz->id}")->assertStatus(403);

        // 4. Secretary reassigns teacher to 1st Year -> visibility dynamically switches
        $reassignRes = $this->actingAs($secretary)->putJson("/api/users/{$teacher->id}", [
            'grade' => '1st Year',
        ]);
        $reassignRes->assertOk();
        $reassignRes->assertJsonPath('data.grade', '1st Year');

        $yr1FeedAfter = $this->actingAs($studentYear1)->getJson('/api/student/quizzes');
        $this->assertContains($quiz->id, collect($yr1FeedAfter->json('quizzes'))->pluck('id')->all());

        $yr2FeedAfter = $this->actingAs($studentYear2)->getJson('/api/student/quizzes');
        $this->assertNotContains($quiz->id, collect($yr2FeedAfter->json('quizzes'))->pluck('id')->all());

        // 5. Secretary clears handled year level (null) -> unrestricted visibility across year levels
        $this->actingAs($secretary)->putJson("/api/users/{$teacher->id}", ['grade' => null])->assertOk();
        $this->assertContains($quiz->id, collect($this->actingAs($studentYear2)->getJson('/api/student/quizzes')->json('quizzes'))->pluck('id')->all());
    }

    public function test_teacher_insights_returns_item_misconceptions_mastery_bands_and_recommendations(): void
    {
        config()->set('services.gemini.api_key', '');

        $teacher = User::factory()->create([
            'role' => 'teacher',
            'department' => 'CIT',
            'grade' => '1st Year',
            'password' => Hash::make('password123'),
        ]);

        $studentA = User::factory()->create([
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '1st Year',
            'section' => 'Block - 1A',
        ]);

        $studentB = User::factory()->create([
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '1st Year',
            'section' => 'Block - 1B',
        ]);

        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'department' => 'CIT',
            'title' => 'Intro Programming Check',
            'subject' => 'IT 102 - Fundamentals of Programming',
            'topic' => 'Control Flow & Loops',
            'questions' => [
                [
                    'prompt' => 'Which loop guarantees at least one execution?',
                    'skill' => 'Loop Constructs',
                    'type' => 'multiple_choice',
                    'options' => ['for loop', 'do-while loop', 'while loop', 'foreach loop'],
                    'correct_index' => 1,
                    'points' => 1,
                ],
                [
                    'prompt' => 'Which operator checks strict equality without type coercion in JS?',
                    'skill' => 'Comparison Operators',
                    'type' => 'multiple_choice',
                    'options' => ['==', '=', '===', '!='],
                    'correct_index' => 2,
                    'points' => 1,
                ],
            ],
            'is_published' => true,
        ]);

        // Empty state check first
        $emptyInsights = $this->actingAs($teacher)->getJson('/api/teacher/insights');
        $emptyInsights->assertOk();
        $emptyInsights->assertJsonPath('summary.total_attempts', 0);
        $emptyInsights->assertJsonPath('summary.handled_year_level', '1st Year');

        // Student A gets 100%, Student B misses both Q1 (chose 'while loop' idx 2) and Q2 (chose '==' idx 0) and has 2 flags
        QuizAttempt::create([
            'quiz_id' => $quiz->id,
            'student_id' => $studentA->id,
            'answers' => [1, 2],
            'score' => 2,
            'max_score' => 2,
            'percentage' => 100,
            'recommendation' => ['summary' => 'Strong mastery', 'focus_topics' => [], 'action_steps' => []],
            'cheating_attempts_count' => 0,
            'completed_at' => now(),
        ]);

        QuizAttempt::create([
            'quiz_id' => $quiz->id,
            'student_id' => $studentB->id,
            'answers' => [2, 0],
            'score' => 0,
            'max_score' => 2,
            'percentage' => 0,
            'recommendation' => ['summary' => 'Needs review', 'focus_topics' => ['Loop Constructs'], 'action_steps' => ['Practice do-while']],
            'cheating_attempts_count' => 2,
            'completed_at' => now(),
        ]);

        $res = $this->actingAs($teacher)->getJson("/api/teacher/insights?quiz_id={$quiz->id}&refresh=1");
        $res->assertOk();
        $res->assertJsonPath('selected_quiz_id', $quiz->id);
        $res->assertJsonPath('summary.total_attempts', 2);
        $res->assertJsonPath('summary.average_percentage', 50);
        $res->assertJsonPath('summary.at_risk_count', 1);
        $res->assertJsonPath('summary.flagged_attempts', 1);
        $res->assertJsonPath('mastery_bands.proficient.count', 1);
        $res->assertJsonPath('mastery_bands.at_risk.count', 1);
        $res->assertJsonPath('remedial_draft.subject', 'IT 102 - Fundamentals of Programming');

        $missed = $res->json('missed_questions');
        $this->assertNotEmpty($missed);
        $this->assertStringContainsString('while loop', (string) ($missed[0]['most_common_wrong_answer'] ?? ''));

        $atRisk = $res->json('at_risk_students');
        $this->assertCount(1, $atRisk);
        $this->assertSame($studentB->id, $atRisk[0]['student_id']);

        $recommendations = $res->json('ai.recommendations');
        $this->assertGreaterThanOrEqual(2, count($recommendations));

        // Authorization boundaries: teachers cannot alter their own handled grade via /users,
        // nor inspect another teacher's quiz in /teacher/insights
        $this->actingAs($teacher)->putJson("/api/users/{$teacher->id}", ['grade' => null])->assertStatus(403);

        $otherTeacher = User::factory()->create(['role' => 'teacher', 'department' => 'CIT']);
        $this->actingAs($otherTeacher)->getJson("/api/teacher/insights?quiz_id={$quiz->id}")->assertStatus(404);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuizTargetingAndAntiCheatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\DemoSeeder::class);
    }

    public function test_teacher_can_edit_quiz_content(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);
        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'title' => 'Original Title',
            'subject' => 'Science',
            'topic' => 'Cells',
            'instructions' => 'Read carefully.',
            'questions' => [
                [
                    'prompt' => 'What is the powerhouse of the cell?',
                    'options' => ['Ribosome', 'Mitochondria', 'Nucleus', 'Vacuole'],
                    'correct_index' => 1,
                ]
            ],
            'is_published' => false,
        ]);

        $response = $this->actingAs($teacher)->putJson("/api/teacher/quizzes/{$quiz->id}", [
            'title' => 'Updated Biology Quiz',
            'topic' => 'Cell Biology & Mitochondria',
            'instructions' => 'Time limit 20 mins. Alt-tabbing is prohibited.',
            'time_limit_minutes' => 20,
            'questions' => [
                [
                    'prompt' => 'Which organelle produces ATP?',
                    'options' => ['Mitochondria', 'Chloroplast', 'Golgi Apparatus', 'Endoplasmic Reticulum'],
                    'correct_index' => 0,
                ]
            ],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('quizzes', [
            'id' => $quiz->id,
            'title' => 'Updated Biology Quiz',
            'time_limit_minutes' => 20,
        ]);
    }

    public function test_teacher_can_publish_with_target_selection(): void
    {
        $teacher = User::where('role', 'teacher')->first();
        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'title' => 'IT 101 Quiz',
            'subject' => 'IT 101 - Introduction To Computing',
            'topic' => 'Number Systems',
            'instructions' => 'Read carefully.',
            'questions' => [
                [
                    'prompt' => 'What is the base of the binary number system?',
                    'options' => ['2', '8', '10', '16'],
                    'correct_index' => 0,
                ]
            ],
            'is_published' => false,
        ]);

        $response = $this->actingAs($teacher)->patchJson("/api/teacher/quizzes/{$quiz->id}/publish", [
            'is_published' => true,
            'target_type' => 'section',
            'target_sections' => ['Block - 1A'],
            'time_limit_minutes' => 15,
        ]);

        $response->assertStatus(200);
        $quiz->refresh();
        $this->assertTrue($quiz->is_published);
        $this->assertEquals('section', $quiz->target_type);
        $this->assertContains('Block - 1A', $quiz->target_sections);
    }

    public function test_student_targeting_access_and_proctoring_submission(): void
    {
        $teacher = User::where('role', 'teacher')->first();
        $studentBlock1A = User::where('lrn', '20273710')->first(); // 1st Year, Block - 1A
        $studentBlock2B = User::factory()->create([
            'name' => 'Second Year Student',
            'email' => 'student2b@tcc.edu.ph',
            'lrn' => '20273799',
            'role' => 'student',
            'grade' => '2nd Year',
            'section' => 'Block - 2B',
            'status' => 'active',
        ]);

        // Create quiz targeted specifically to Block - 1A
        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'title' => 'Block 1A Only Assessment',
            'subject' => 'IT 101 - Introduction To Computing',
            'topic' => 'Computing Basics',
            'instructions' => 'Follow anti-cheat rules.',
            'questions' => [
                [
                    'prompt' => 'Which device is an input peripheral?',
                    'options' => ['Keyboard', 'Monitor', 'Printer', 'Speaker'],
                    'correct_index' => 0,
                ]
            ],
            'is_published' => true,
            'target_type' => 'section',
            'target_sections' => ['Block - 1A'],
        ]);

        // Student in Block - 1A can see it
        $res1A = $this->actingAs($studentBlock1A)->getJson('/api/student/quizzes');
        $res1A->assertStatus(200);
        $quizIds = collect($res1A->json('quizzes'))->pluck('id');
        $this->assertTrue($quizIds->contains($quiz->id));

        // Student in Block - 2B should NOT see it
        $res2B = $this->actingAs($studentBlock2B)->getJson('/api/student/quizzes');
        $res2B->assertStatus(200);
        $quizIds2B = collect($res2B->json('quizzes'))->pluck('id');
        $this->assertFalse($quizIds2B->contains($quiz->id));

        // Block 1A student submits quiz with anti-cheat violation telemetry
        $resSubmit = $this->actingAs($studentBlock1A)->postJson("/api/student/quizzes/{$quiz->id}/submit", [
            'answers' => [0],
            'cheating_attempts_count' => 2,
            'violations' => [
                [
                    'type' => 'assessment_window_blurred',
                    'label' => 'Focus Lost (Alt-Tab)',
                    'timestamp' => now()->toIso8601String(),
                ],
                [
                    'type' => 'screenshot_shortcut',
                    'label' => 'Screenshot Attempt Intercepted',
                    'timestamp' => now()->toIso8601String(),
                ],
            ],
        ]);

        $resSubmit->assertStatus(201);
        $this->assertDatabaseHas('quiz_attempts', [
            'quiz_id' => $quiz->id,
            'student_id' => $studentBlock1A->id,
            'cheating_attempts_count' => 2,
            'score' => 1,
        ]);

        // Teacher can view submissions with proctoring violations
        $resTeacher = $this->actingAs($teacher)->getJson("/api/teacher/quizzes/{$quiz->id}/submissions");
        $resTeacher->assertStatus(200);
        $submissions = $resTeacher->json('submissions');
        $this->assertCount(1, $submissions);
        $this->assertEquals(2, $submissions[0]['cheating_attempts_count']);
        $this->assertCount(2, $submissions[0]['violations']);
    }

    public function test_dean_routes_work_interchangeably(): void
    {
        $dean = User::whereIn('role', ['dean', 'principal'])->first() ?? User::factory()->create(['role' => 'dean']);
        
        $response = $this->actingAs($dean)->getJson('/api/dean/dashboard');
        $response->assertStatus(200);

        $resLogs = $this->actingAs($dean)->getJson('/api/dean/security-logs');
        $resLogs->assertStatus(200);
    }
}

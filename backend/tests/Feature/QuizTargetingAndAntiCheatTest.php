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
        $quiz = Quiz::where('teacher_id', $teacher->id)->first();

        $response = $this->actingAs($teacher)->patchJson("/api/teacher/quizzes/{$quiz->id}/publish", [
            'is_published' => true,
            'target_type' => 'section',
            'target_sections' => ['Grade 10 - Emerald'],
            'time_limit_minutes' => 15,
        ]);

        $response->assertStatus(200);
        $quiz->refresh();
        $this->assertTrue($quiz->is_published);
        $this->assertEquals('section', $quiz->target_type);
        $this->assertContains('Grade 10 - Emerald', $quiz->target_sections);
    }

    public function test_student_targeting_access_and_proctoring_submission(): void
    {
        $teacher = User::where('role', 'teacher')->first();
        $studentEmerald = User::where('email', 'maria.santos@lnhs.test')->first(); // Grade 10, Emerald
        $studentRizal = User::where('lrn', '20273710')->first(); // Grade 7, Rizal

        // Create quiz targeted specifically to Emerald
        $quiz = Quiz::create([
            'teacher_id' => $teacher->id,
            'title' => 'Emerald Only Assessment',
            'subject' => 'Science',
            'topic' => 'Ecology',
            'instructions' => 'Follow anti-cheat rules.',
            'questions' => [
                [
                    'prompt' => 'What is an ecosystem?',
                    'options' => ['Community of organisms and environment', 'A single animal', 'Only plants', 'A rock'],
                    'correct_index' => 0,
                ]
            ],
            'is_published' => true,
            'target_type' => 'section',
            'target_sections' => ['Grade 10 - Emerald', 'Emerald'],
        ]);

        // Student in Emerald can see it
        $resEmerald = $this->actingAs($studentEmerald)->getJson('/api/student/quizzes');
        $resEmerald->assertStatus(200);
        $quizIds = collect($resEmerald->json('quizzes'))->pluck('id');
        $this->assertTrue($quizIds->contains($quiz->id));

        // Student in Rizal should NOT see it
        $resRizal = $this->actingAs($studentRizal)->getJson('/api/student/quizzes');
        $resRizal->assertStatus(200);
        $quizIdsRizal = collect($resRizal->json('quizzes'))->pluck('id');
        $this->assertFalse($quizIdsRizal->contains($quiz->id));

        // Emerald student submits quiz with anti-cheat violation telemetry
        $resSubmit = $this->actingAs($studentEmerald)->postJson("/api/student/quizzes/{$quiz->id}/submit", [
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
            'student_id' => $studentEmerald->id,
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

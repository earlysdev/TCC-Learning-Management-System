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
        $teacher->update(['grade' => '1st Year']);
        $studentBlock1A = User::where('role', 'student')->where('section', 'Block - 1A')->first(); // 1st Year, Block - 1A
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

    public function test_teacher_can_create_manual_quiz_with_custom_question_count_and_clean_title(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);

        $response = $this->actingAs($teacher)->postJson('/api/teacher/quizzes', [
            'title' => '',
            'subject' => 'IT 108 • Data Structures & Algorithms',
            'topic' => 'Binary Search Trees',
            'count' => 12,
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('quiz.title', 'Quiz 1');
        $response->assertJsonPath('quiz.topic', 'Binary Search Trees');
        $response->assertJsonPath('quiz.question_count', 12);
        $this->assertCount(12, $response->json('quiz.questions'));

        // Creating a second quiz with empty title in the same course auto-assigns Quiz 2
        $secondResponse = $this->actingAs($teacher)->postJson('/api/teacher/quizzes', [
            'title' => '',
            'subject' => 'IT 108 - Data Structures & Algorithms',
            'topic' => 'AVL Trees',
            'count' => 5,
        ]);
        $secondResponse->assertStatus(201);
        $secondResponse->assertJsonPath('quiz.title', 'Quiz 2');

        // Loading teacher dashboard does not randomize manual quiz correct_index
        $secondQuizId = $secondResponse->json('quiz.id');
        $this->actingAs($teacher)->getJson('/api/teacher/dashboard')->assertStatus(200);
        $freshManual = Quiz::findOrFail($secondQuizId);
        foreach ($freshManual->questions as $q) {
            $this->assertSame(0, $q['correct_index']);
        }
    }

    public function test_quiz_duplication_assigns_sequential_names_handles_deleted_numbers_and_isolates_questions(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);

        $originalRes = $this->actingAs($teacher)->postJson('/api/teacher/quizzes', [
            'title' => 'Quiz 1',
            'subject' => 'IT 101 • Introduction To Computing',
            'topic' => 'Introduction To Computing',
            'quiz_type' => 'summative',
            'time_limit_minutes' => 30,
            'allow_review' => false,
            'instructions' => 'Answer all items carefully.',
            'questions' => [
                [
                    'type' => 'multiple_choice',
                    'prompt' => 'Which unit performs arithmetic operations in the CPU?',
                    'skill' => 'CPU Architecture',
                    'points' => 2,
                    'options' => ['ALU', 'CU', 'RAM', 'BIOS'],
                    'correct_index' => 0,
                ],
            ],
        ]);
        $originalRes->assertStatus(201);
        $quiz1Id = $originalRes->json('quiz.id');

        // 1st duplication -> Quiz 2
        $dup1 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$quiz1Id}/duplicate");
        $dup1->assertStatus(201);
        $dup1->assertJsonPath('quiz.title', 'Quiz 2');
        $quiz2Id = $dup1->json('quiz.id');

        // 2nd duplication -> Quiz 3
        $dup2 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$quiz1Id}/duplicate");
        $dup2->assertStatus(201);
        $dup2->assertJsonPath('quiz.title', 'Quiz 3');
        $quiz3Id = $dup2->json('quiz.id');

        // 3rd duplication -> Quiz 4
        $dup3 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$quiz1Id}/duplicate");
        $dup3->assertStatus(201);
        $dup3->assertJsonPath('quiz.title', 'Quiz 4');

        // Delete Quiz 2 -> next duplication reclaims Quiz 2 without colliding with Quiz 3 or Quiz 4
        $this->actingAs($teacher)->deleteJson("/api/teacher/quizzes/{$quiz2Id}")->assertStatus(200);

        $dupReclaimed = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$quiz1Id}/duplicate");
        $dupReclaimed->assertStatus(201);
        $dupReclaimed->assertJsonPath('quiz.title', 'Quiz 2');

        // Next duplication after reclaiming Quiz 2 advances to Quiz 5
        $dup5 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$quiz3Id}/duplicate");
        $dup5->assertStatus(201);
        $dup5->assertJsonPath('quiz.title', 'Quiz 5');

        // Custom name duplication: Midterm Examination -> Midterm Examination 2 -> Midterm Examination 3
        $customRes = $this->actingAs($teacher)->postJson('/api/teacher/quizzes', [
            'title' => 'Midterm Examination',
            'subject' => 'IT 101 • Introduction To Computing',
            'topic' => 'Midterm Coverage',
            'count' => 2,
        ]);
        $customRes->assertStatus(201);
        $customId = $customRes->json('quiz.id');

        $customDup1 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$customId}/duplicate");
        $customDup1->assertStatus(201);
        $customDup1->assertJsonPath('quiz.title', 'Midterm Examination 2');
        $customDup1Id = $customDup1->json('quiz.id');

        $customDup2 = $this->actingAs($teacher)->postJson("/api/teacher/quizzes/{$customDup1Id}/duplicate");
        $customDup2->assertStatus(201);
        $customDup2->assertJsonPath('quiz.title', 'Midterm Examination 3');

        // Editing duplicated quiz questions must NOT mutate the original quiz
        $this->actingAs($teacher)->putJson("/api/teacher/quizzes/{$quiz3Id}", [
            'questions' => [
                [
                    'type' => 'multiple_choice',
                    'prompt' => 'Modified question in Quiz 3 only?',
                    'skill' => 'Memory Hierarchy',
                    'points' => 5,
                    'options' => ['Cache', 'SSD', 'HDD', 'Tape'],
                    'correct_index' => 0,
                ],
            ],
        ])->assertStatus(200);

        $freshOriginal = Quiz::findOrFail($quiz1Id);
        $freshDup3 = Quiz::findOrFail($quiz3Id);

        $this->assertSame('Which unit performs arithmetic operations in the CPU?', $freshOriginal->questions[0]['prompt']);
        $this->assertSame(2, $freshOriginal->questions[0]['points']);
        $this->assertSame('Modified question in Quiz 3 only?', $freshDup3->questions[0]['prompt']);
        $this->assertSame(5, $freshDup3->questions[0]['points']);
    }

    public function test_teacher_can_upload_pdf_for_ai_question_generation_and_post_quiz_study_feedback(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);
        $teacher->update(['grade' => null]);
        $student = User::where('role', 'student')->first() ?? User::factory()->create(['role' => 'student']);

        $response = $this->actingAs($teacher)->postJson('/api/teacher/quizzes', [
            'title' => 'Database Normalization Quiz',
            'subject' => 'IT 116 - Advanced Database System',
            'topic' => 'Third Normal Form (3NF)',
            'count' => 4,
            'generate_with_ai' => true,
            'difficulty' => 'medium',
            'pdf_name' => 'Module_4_Database_Normalization.pdf',
            'pdf_text' => 'Third Normal Form (3NF) requires that a relation is in Second Normal Form (2NF) and every non-prime attribute is non-transitively dependent on every superkey. Eliminating transitive dependencies prevents update, insertion, and deletion anomalies in relational database schemas.',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('quiz.reference_pdf_name', 'Module_4_Database_Normalization.pdf');
        $response->assertJsonPath('quiz.generated_by_ai', true);
        $response->assertJsonPath('quiz.question_count', 4);

        $quizId = $response->json('quiz.id');
        $this->actingAs($teacher)->patchJson("/api/teacher/quizzes/{$quizId}/publish", [
            'is_published' => true,
            'target_type' => 'all',
        ])->assertStatus(200);

        $submitRes = $this->actingAs($student)->postJson("/api/student/quizzes/{$quizId}/submit", [
            'answers' => [1, 1, 1, 1],
        ]);
        $submitRes->assertStatus(201);
        $this->assertStringContainsString(
            'Module_4_Database_Normalization.pdf',
            (string) $submitRes->json('attempt.recommendation.summary')
        );
    }
}

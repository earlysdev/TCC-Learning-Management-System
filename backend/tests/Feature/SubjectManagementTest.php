<?php

namespace Tests\Feature;

use App\Models\Quiz;
use App\Models\Subject;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubjectManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\DemoSeeder::class);
    }

    public function test_authenticated_user_can_list_subjects(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);

        $response = $this->actingAs($teacher)->getJson('/api/subjects');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'subjects' => [
                '*' => ['id', 'name', 'code', 'grade', 'department', 'quizzes_count']
            ]
        ]);
        $this->assertNotEmpty($response->json('subjects'));
    }

    public function test_secretary_can_add_new_subject(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $response = $this->actingAs($secretary)->postJson('/api/subjects', [
            'name' => 'Computer Systems Servicing',
            'code' => 'CSS',
            'grade' => 'Grade 11',
            'department' => 'TVL Department',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('subjects', [
            'name' => 'Computer Systems Servicing',
            'code' => 'CSS',
            'grade' => 'Grade 11',
        ]);
    }

    public function test_cannot_add_duplicate_subject(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $response = $this->actingAs($secretary)->postJson('/api/subjects', [
            'name' => 'Science',
            'code' => 'SCI',
            'grade' => 'All Grades',
        ]);

        $response->assertStatus(422);
    }

    public function test_cannot_delete_subject_with_active_quizzes(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);
        $science = Subject::where('name', 'Science')->firstOrFail();

        // The DemoSeeder creates a Science quiz
        $this->assertTrue(Quiz::where('subject', 'Science')->exists());

        $response = $this->actingAs($secretary)->deleteJson("/api/subjects/{$science->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('subjects', ['id' => $science->id]);
    }

    public function test_can_delete_unused_subject(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $newSubj = Subject::create([
            'name' => 'Temporary Elective',
            'code' => 'ELEC',
            'grade' => 'Grade 12',
        ]);

        $response = $this->actingAs($secretary)->deleteJson("/api/subjects/{$newSubj->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('subjects', ['id' => $newSubj->id]);
    }

    public function test_student_cannot_manage_subjects(): void
    {
        $student = User::where('role', 'student')->first() ?? User::factory()->create(['role' => 'student']);

        $response = $this->actingAs($student)->postJson('/api/subjects', [
            'name' => 'Hacking 101',
            'code' => 'HACK',
        ]);

        $response->assertStatus(403);
    }
}

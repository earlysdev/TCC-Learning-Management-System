<?php

namespace Tests\Feature;

use App\Models\Section;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SectionManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\DemoSeeder::class);
    }

    public function test_secretary_can_view_sections_with_student_counts(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $response = $this->actingAs($secretary)->getJson('/api/sections');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'sections' => [
                '*' => ['id', 'grade', 'name', 'display_name', 'student_count', 'students_count']
            ]
        ]);
    }

    public function test_secretary_can_add_section_to_specific_grade_level(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $response = $this->actingAs($secretary)->postJson('/api/sections', [
            'grade' => 'Grade 8',
            'name' => 'Sapphire-B',
            'display_name' => 'Grade 8 - Sapphire-B',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('sections', [
            'grade' => 'Grade 8',
            'name' => 'Sapphire-B',
        ]);
    }

    public function test_cannot_add_duplicate_section_in_same_grade_level(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        // First creation
        $this->actingAs($secretary)->postJson('/api/sections', [
            'grade' => 'Grade 9',
            'name' => 'Amethyst',
        ])->assertStatus(201);

        // Duplicate creation attempt
        $response = $this->actingAs($secretary)->postJson('/api/sections', [
            'grade' => 'Grade 9',
            'name' => 'Amethyst',
        ]);

        $response->assertStatus(422);
    }

    public function test_cannot_delete_section_with_active_enrolled_students(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        // Create section and a student enrolled in it
        $section = Section::create([
            'grade' => 'Grade 10',
            'name' => 'Ruby-Protected',
            'display_name' => 'Grade 10 - Ruby-Protected',
        ]);

        User::factory()->create([
            'role' => 'student',
            'grade' => 'Grade 10',
            'section' => 'Ruby-Protected',
        ]);

        $response = $this->actingAs($secretary)->deleteJson("/api/sections/{$section->id}");

        $response->assertStatus(422);
        $response->assertJsonFragment([
            'status' => 'error',
        ]);
        $this->assertDatabaseHas('sections', ['id' => $section->id]);
    }

    public function test_can_delete_empty_section(): void
    {
        $secretary = User::where('role', 'secretary')->first() ?? User::factory()->create(['role' => 'secretary']);

        $section = Section::create([
            'grade' => 'Grade 11',
            'name' => 'STEM-Empty',
            'display_name' => 'Grade 11 - STEM-Empty',
        ]);

        $response = $this->actingAs($secretary)->deleteJson("/api/sections/{$section->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('sections', ['id' => $section->id]);
    }

    public function test_student_cannot_manage_sections(): void
    {
        $student = User::where('role', 'student')->first() ?? User::factory()->create(['role' => 'student']);

        $response = $this->actingAs($student)->postJson('/api/sections', [
            'grade' => 'Grade 7',
            'name' => 'Unauthorized-Section',
        ]);

        $response->assertStatus(403);
    }

    public function test_teacher_can_fetch_student_roster(): void
    {
        $teacher = User::where('role', 'teacher')->first() ?? User::factory()->create(['role' => 'teacher']);

        $response = $this->actingAs($teacher)->getJson('/api/teacher/students');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'status',
            'data' => [
                '*' => ['id', 'name', 'role', 'grade', 'section']
            ]
        ]);
    }
}

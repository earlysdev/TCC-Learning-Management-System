<?php

namespace Tests\Feature;

use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_one_dean_can_exist_per_department(): void
    {
        $developer = User::factory()->create([
            'email' => 'dev@tcc.edu.ph',
            'role' => 'developer',
            'department' => 'CIT',
        ]);

        // CIT gets its single Dean
        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'CIT Dean',
            'email' => 'dean.cit@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'dean',
            'department' => 'CIT',
        ])->assertCreated();

        // Second Dean in CIT is rejected with specific single-Dean message
        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'Duplicate CIT Dean',
            'email' => 'dean2.cit@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'dean',
            'department' => 'CIT',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'The CIT department already has an assigned Dean. Only 1 Dean exists per department.');

        // Non-Dean roles in the same department remain creatable when a Dean already exists
        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'CIT Teacher',
            'email' => 'teacher.cit@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'teacher',
            'department' => 'CIT',
        ])->assertCreated();

        // Another department (CED) can still have its own single Dean & Secretary
        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'CED Dean',
            'email' => 'dean.ced@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'dean',
            'department' => 'CED',
        ])->assertCreated();

        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'CED Secretary',
            'email' => 'sec.ced@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'secretary',
            'department' => 'CED',
        ])->assertCreated();
    }

    public function test_dean_and_secretary_are_isolated_to_their_own_department(): void
    {
        $citDean = User::factory()->create([
            'name' => 'CIT Dean',
            'email' => 'cit.dean@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $cedDean = User::factory()->create([
            'name' => 'CED Dean',
            'email' => 'ced.dean@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CED',
        ]);

        $citStudent = User::factory()->create([
            'name' => 'CIT Student',
            'email' => 'cit.student@tcc.edu.ph',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        $cedStudent = User::factory()->create([
            'name' => 'CED Student',
            'email' => 'ced.student@tcc.edu.ph',
            'role' => 'student',
            'department' => 'CED',
        ]);

        $this->assertFalse($citDean->isInstitutionWide());
        $this->assertTrue($citDean->isDeanRole());

        // Attempting to spoof ?department=CED or ?department=all stays locked to CIT
        $usersResponse = $this->actingAs($citDean)->getJson('/api/users?department=CED')->assertOk();
        $returnedIds = collect($usersResponse->json('data.data'))->pluck('id')->all();
        $this->assertContains($citStudent->id, $returnedIds);
        $this->assertNotContains($cedStudent->id, $returnedIds);

        // Cross-department user mutation & status toggle blocked with 403
        $this->actingAs($citDean)
            ->patchJson("/api/users/{$cedStudent->id}/status", ['status' => 'inactive'])
            ->assertForbidden();

        // Security batch resolution only resolves alerts in the Dean's own department
        $citAlert = SecurityLog::create([
            'user_id' => $citStudent->id,
            'event_type' => 'login_failed',
            'ip_address' => '192.168.1.50',
            'is_resolved' => false,
        ]);

        $cedAlert = SecurityLog::create([
            'user_id' => $cedStudent->id,
            'event_type' => 'login_failed',
            'ip_address' => '192.168.1.51',
            'is_resolved' => false,
        ]);

        $this->actingAs($citDean)->patchJson('/api/security-logs/resolve-all?department=CED')
            ->assertOk()
            ->assertJsonPath('resolved_count', 1);

        $this->assertTrue($citAlert->fresh()->is_resolved);
        $this->assertFalse($cedAlert->fresh()->is_resolved);

        // CED Dean cannot resolve CIT alert individually
        $this->actingAs($cedDean)
            ->patchJson("/api/security-logs/{$citAlert->id}/resolve")
            ->assertForbidden();

        // Unattributed security log must fail closed for department-scoped Deans
        $unattributedLog = SecurityLog::create([
            'event_type' => 'login_failed',
            'ip_address' => '10.0.0.99',
            'is_resolved' => false,
        ]);

        $this->actingAs($citDean)
            ->patchJson("/api/security-logs/{$unattributedLog->id}/resolve")
            ->assertForbidden();
    }

    public function test_announcements_settings_and_teacher_dashboard_are_department_isolated(): void
    {
        $developer = User::factory()->create([
            'email' => 'dev.iso@tcc.edu.ph',
            'role' => 'developer',
            'department' => 'CIT',
        ]);

        $citDean = User::factory()->create([
            'email' => 'cit.dean.iso@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $cedDean = User::factory()->create([
            'email' => 'ced.dean.iso@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CED',
        ]);

        $citTeacher = User::factory()->create([
            'email' => 'cit.teacher.iso@tcc.edu.ph',
            'role' => 'teacher',
            'department' => 'CIT',
        ]);

        \App\Models\Quiz::create([
            'teacher_id' => $citTeacher->id,
            'department' => 'CIT',
            'title' => 'CIT Quiz 1',
            'subject' => 'IT 101',
            'topic' => 'Basics',
            'questions' => [],
            'is_published' => true,
        ]);

        // Quiz::visibleTo works for Deans and Developers without crashing
        $this->actingAs($citDean)->getJson('/api/teacher/dashboard')
            ->assertOk()
            ->assertJsonCount(1, 'quizzes');

        $this->actingAs($cedDean)->getJson('/api/teacher/dashboard')
            ->assertOk()
            ->assertJsonCount(0, 'quizzes');

        $this->actingAs($developer)->getJson('/api/teacher/dashboard')
            ->assertOk()
            ->assertJsonCount(1, 'quizzes');

        // Announcements stay strictly inside the author's department
        $created = $this->actingAs($citDean)->postJson('/api/announcements', [
            'title' => 'CIT General Assembly',
            'content' => 'Room 201 tomorrow',
        ])->assertCreated();

        $announcementId = $created->json('data.id');
        $this->assertNotEmpty($this->actingAs($citDean)->getJson('/api/announcements')->assertOk()->json('data.data'));
        $this->assertEmpty($this->actingAs($cedDean)->getJson('/api/announcements')->assertOk()->json('data.data'));

        $this->actingAs($cedDean)->deleteJson("/api/announcements/{$announcementId}")->assertForbidden();
    }

    public function test_department_staff_cannot_modify_or_deactivate_developer_accounts(): void
    {
        $developer = User::factory()->create([
            'email' => 'dev.protected@tcc.edu.ph',
            'role' => 'developer',
            'department' => 'CIT',
        ]);

        $citDean = User::factory()->create([
            'email' => 'dean.cit.guard@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $citSecretary = User::factory()->create([
            'email' => 'sec.cit.guard@tcc.edu.ph',
            'role' => 'secretary',
            'department' => 'CIT',
        ]);

        foreach ([$citDean, $citSecretary] as $actor) {
            $this->actingAs($actor)->putJson("/api/users/{$developer->id}", [
                'name' => 'Hijacked Dev',
                'password' => 'PwnedPass!2026',
            ])->assertForbidden();

            $this->actingAs($actor)->patchJson("/api/users/{$developer->id}/status", [
                'status' => 'inactive',
            ])->assertForbidden();
        }
    }
}

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

        // Second Dean in CIT is rejected
        $this->actingAs($developer)->postJson('/api/users', [
            'name' => 'Duplicate CIT Dean',
            'email' => 'dean2.cit@tcc.edu.ph',
            'password' => 'StrongPass!2026',
            'role' => 'dean',
            'department' => 'CIT',
        ])->assertStatus(422);

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
    }
}

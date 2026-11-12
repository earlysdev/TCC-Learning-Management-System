<?php

namespace Tests\Feature;

use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SecurityLogResolutionTest extends TestCase
{
    use RefreshDatabase;

    public function test_dean_can_batch_resolve_pending_security_logs_with_auditor_attribution(): void
    {
        $dean = User::factory()->create([
            'name' => 'Dean Auditor',
            'email' => 'dean.auditor@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $originalAuditor = User::factory()->create([
            'name' => 'Original Auditor',
            'email' => 'developer.orig@tcc.edu.ph',
            'role' => 'developer',
            'department' => null,
        ]);

        $student = User::factory()->create([
            'email' => 'student.alert@tcc.edu.ph',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        $pendingOne = SecurityLog::create([
            'user_id' => $student->id,
            'event_type' => 'login_failed',
            'ip_address' => '192.168.1.10',
            'is_resolved' => false,
        ]);

        $pendingTwo = SecurityLog::create([
            'user_id' => $student->id,
            'event_type' => 'unrecognized_device',
            'ip_address' => '192.168.1.11',
            'is_resolved' => false,
        ]);

        $originalTime = now()->subDays(2)->startOfSecond();
        $alreadyResolved = SecurityLog::create([
            'user_id' => $student->id,
            'event_type' => 'login_failed',
            'ip_address' => '192.168.1.12',
            'is_resolved' => true,
            'resolved_at' => $originalTime,
            'resolved_by' => $originalAuditor->id,
        ]);

        $response = $this->actingAs($dean)->patchJson('/api/security-logs/resolve-all');

        $response->assertOk()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('resolved_count', 2)
            ->assertJsonPath('resolver.id', $dean->id)
            ->assertJsonPath('resolver.name', $dean->name);

        $this->assertNotEmpty($response->json('resolved_at'));

        $pendingOne->refresh();
        $pendingTwo->refresh();
        $alreadyResolved->refresh();

        $this->assertTrue($pendingOne->is_resolved);
        $this->assertSame($dean->id, $pendingOne->resolved_by);
        $this->assertNotNull($pendingOne->resolved_at);

        $this->assertTrue($pendingTwo->is_resolved);
        $this->assertSame($dean->id, $pendingTwo->resolved_by);
        $this->assertNotNull($pendingTwo->resolved_at);

        // Pre-existing attribution must stay untouched
        $this->assertSame($originalAuditor->id, $alreadyResolved->resolved_by);
        $this->assertTrue($alreadyResolved->resolved_at->equalTo($originalTime));

        // Second call reports 0 pending
        $this->actingAs($dean)->patchJson('/api/security-logs/resolve-all')
            ->assertOk()
            ->assertJsonPath('resolved_count', 0)
            ->assertJsonPath('message', 'All outstanding security alerts are already resolved.');
    }

    public function test_single_resolve_is_idempotent_and_preserves_original_auditor(): void
    {
        $firstDean = User::factory()->create([
            'name' => 'First Auditor',
            'email' => 'first.dean@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $secondDean = User::factory()->create([
            'name' => 'Second Auditor',
            'email' => 'second.auditor@tcc.edu.ph',
            'role' => 'developer',
            'department' => null,
        ]);

        $log = SecurityLog::create([
            'department' => 'CIT',
            'event_type' => 'login_failed',
            'ip_address' => '10.0.0.5',
            'is_resolved' => false,
        ]);

        $this->actingAs($firstDean)->patchJson("/api/security-logs/{$log->id}/resolve")
            ->assertOk()
            ->assertJsonPath('message', 'Security log marked as resolved.')
            ->assertJsonPath('data.resolver.id', $firstDean->id);

        $log->refresh();
        $firstTimestamp = $log->resolved_at;

        $this->actingAs($secondDean)->patchJson("/api/security-logs/{$log->id}/resolve")
            ->assertOk()
            ->assertJsonPath('message', 'Security log was already resolved.')
            ->assertJsonPath('data.resolver.id', $firstDean->id);

        $log->refresh();
        $this->assertSame($firstDean->id, $log->resolved_by);
        $this->assertTrue($log->resolved_at->equalTo($firstTimestamp));
    }

    public function test_non_dean_roles_cannot_resolve_security_logs(): void
    {
        $student = User::factory()->create([
            'email' => 'student.unauth@tcc.edu.ph',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        $log = SecurityLog::create([
            'user_id' => $student->id,
            'event_type' => 'login_failed',
            'ip_address' => '127.0.0.1',
            'is_resolved' => false,
        ]);

        $this->actingAs($student)->getJson('/api/security-logs')->assertForbidden();
        $this->actingAs($student)->patchJson('/api/security-logs/resolve-all')->assertForbidden();
        $this->actingAs($student)->patchJson("/api/security-logs/{$log->id}/resolve")->assertForbidden();
    }
}

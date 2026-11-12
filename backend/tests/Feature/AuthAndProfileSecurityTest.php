<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VerificationCode;
use App\Services\LmsOtpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AuthAndProfileSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_update_profile_requires_valid_current_password_and_bound_otp(): void
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'student.real@tcc.edu.ph',
            'password' => 'OriginalPass!2026',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        $otherUser = User::factory()->create([
            'email' => 'other.student@tcc.edu.ph',
            'password' => 'OtherPass!2026',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        // Issue OTP for $otherUser and ensure $user cannot replay it
        $otpService = app(LmsOtpService::class);
        $otherChallenge = $otpService->issue($otherUser, VerificationCode::PURPOSE_PASSWORD_CHANGE);

        // Wrong current password rejected
        $this->actingAs($user)->putJson('/api/profile', [
            'name' => 'Updated Student',
            'current_password' => 'WrongPassword123',
            'code' => '123456',
            'challenge' => $otherChallenge['challenge'],
        ])->assertStatus(422);

        // Cross-user OTP challenge rejected even with valid current password
        VerificationCode::where('challenge', $otherChallenge['challenge'])->update([
            'code_hash' => Hash::make('654321'),
        ]);

        $this->actingAs($user)->putJson('/api/profile', [
            'name' => 'Updated Student',
            'current_password' => 'OriginalPass!2026',
            'code' => '654321',
            'challenge' => $otherChallenge['challenge'],
        ])->assertStatus(422);

        // Issue user-bound OTP and confirm valid settings + optional password update
        $ownChallenge = $otpService->issue($user, VerificationCode::PURPOSE_PASSWORD_CHANGE);
        VerificationCode::where('challenge', $ownChallenge['challenge'])->update([
            'code_hash' => Hash::make('112233'),
        ]);

        $otherToken = $user->createToken('other-session')->plainTextToken;
        $this->assertNotEmpty($otherToken);
        $currentToken = $user->createToken('current-session');

        $this->withHeader('Authorization', 'Bearer ' . $currentToken->plainTextToken)
            ->putJson('/api/profile', [
                'name' => 'Atan Updated',
                'current_password' => 'OriginalPass!2026',
                'password' => 'NewStrong!2026',
                'password_confirmation' => 'NewStrong!2026',
                'code' => '112233',
                'challenge' => $ownChallenge['challenge'],
            ])
            ->assertStatus(200)
            ->assertJsonPath('user.name', 'Atan Updated');

        $user->refresh();
        $this->assertTrue(Hash::check('NewStrong!2026', $user->password));
        $this->assertSame(1, $user->tokens()->count());
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentToken->accessToken->id]);
    }

    public function test_update_profile_blocks_institutional_email_change(): void
    {
        $user = User::factory()->create([
            'email' => 'locked@tcc.edu.ph',
            'password' => 'OriginalPass!2026',
            'role' => 'student',
            'department' => 'CIT',
        ]);

        $this->actingAs($user)->putJson('/api/profile', [
            'name' => 'Locked User',
            'email' => 'attacker@example.com',
            'current_password' => 'OriginalPass!2026',
            'code' => '123456',
            'challenge' => 'dummy-challenge',
        ])->assertStatus(422);
    }

    public function test_forgot_password_returns_uniform_shape_for_unknown_identifier(): void
    {
        $this->postJson('/api/forgot-password', [
            'identifier' => 'nonexistent@tcc.edu.ph',
        ])->assertStatus(200)->assertJsonStructure([
            'status',
            'requires_code',
            'challenge',
            'email_hint',
            'message',
        ]);
    }

    public function test_login_does_not_bypass_changed_demo_password(): void
    {
        $dean = User::factory()->create([
            'email' => 'dean@tcc.edu.ph',
            'password' => 'CustomDean!999',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $this->postJson('/api/login', [
            'identifier' => $dean->email,
            'password' => 'TccPortal!2026',
        ])->assertStatus(422);
    }
}

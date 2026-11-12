<?php

namespace Tests\Feature;

use App\Mail\LmsAccountCreatedMail;
use App\Mail\LmsPasswordUpdatedMail;
use App\Mail\LmsVerificationMail;
use App\Models\User;
use App\Models\VerificationCode;
use App\Services\LmsMailService;
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

        // Clear any prior actingAs() session guard state so Sanctum authenticates the Bearer token.
        $this->app['auth']->forgetGuards();

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

    public function test_account_creation_and_password_update_dispatch_credentials_mail(): void
    {
        Mail::fake();

        $dean = User::factory()->create([
            'email' => 'dean.mail@tcc.edu.ph',
            'role' => 'dean',
            'department' => 'CIT',
        ]);

        $response = $this->actingAs($dean)->postJson('/api/users', [
            'name' => 'Maria Clara',
            'email' => 'maria.clara@tcc.edu.ph',
            'password' => 'SecretPass!2026',
            'role' => 'teacher',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('email_dispatch.sent', true)
            ->assertJsonPath('email_dispatch.mail_status', 'sent');

        Mail::assertSent(LmsAccountCreatedMail::class, function (LmsAccountCreatedMail $mail): bool {
            return $mail->hasTo('maria.clara@tcc.edu.ph')
                && ! str_contains($mail->portalUrl, 'learning-lms.online');
        });

        $createdId = $response->json('data.id');
        $updateResponse = $this->actingAs($dean)->putJson("/api/users/{$createdId}", [
            'name' => 'Maria Clara Santos',
            'password' => 'UpdatedPass!2026',
        ]);

        $updateResponse->assertOk()
            ->assertJsonPath('email_dispatch.sent', true)
            ->assertJsonPath('email_dispatch.mail_status', 'sent');

        Mail::assertSent(LmsAccountCreatedMail::class, 2);
    }

    public function test_password_reset_and_profile_password_change_dispatch_confirmation_mail(): void
    {
        Mail::fake();

        $student = User::factory()->create([
            'email' => 'reset.student@tcc.edu.ph',
            'password' => 'OldPassword!123',
            'role' => 'student',
            'department' => 'CIT',
            'lrn' => '2026-000999',
        ]);

        $otp = app(LmsOtpService::class)->issue($student, VerificationCode::PURPOSE_PASSWORD_RESET);
        Mail::assertSent(LmsVerificationMail::class);

        $latest = VerificationCode::where('challenge', $otp['challenge'])->firstOrFail();
        $latest->update(['code_hash' => Hash::make('654321')]);

        $this->postJson('/api/reset-password', [
            'challenge' => $otp['challenge'],
            'code' => '654321',
            'password' => 'NewPassword!456',
            'password_confirmation' => 'NewPassword!456',
        ])->assertOk()
            ->assertJsonPath('email_dispatch.sent', true)
            ->assertJsonPath('email_dispatch.mail_status', 'sent');

        Mail::assertSent(LmsPasswordUpdatedMail::class, function (LmsPasswordUpdatedMail $mail): bool {
            return $mail->hasTo('reset.student@tcc.edu.ph') && $mail->changeSource === 'password_reset';
        });
    }

    public function test_mail_service_detects_simulated_and_unconfigured_smtp_transports(): void
    {
        config()->set('mail.default', 'log');
        $logStatus = LmsMailService::inspectTransport();
        $this->assertFalse($logStatus['ready']);
        $this->assertTrue($logStatus['simulated']);

        config()->set('mail.default', 'smtp');
        config()->set('mail.mailers.smtp.host', 'smtp.gmail.com');
        config()->set('mail.mailers.smtp.username', '');
        config()->set('mail.mailers.smtp.password', '');
        $smtpStatus = LmsMailService::inspectTransport();
        $this->assertFalse($smtpStatus['ready']);
        $this->assertFalse($smtpStatus['simulated']);
    }

    public function test_untrusted_origin_header_cannot_hijack_email_portal_url(): void
    {
        config()->set('app.frontend_url', 'https://learning-ms.online');
        config()->set('cors.allowed_origins', ['https://learning-ms.online', 'http://localhost:5173']);

        $this->assertSame(
            'https://learning-ms.online/login',
            LmsMailService::resolvePortalUrl('https://evil.example')
        );
        $this->assertSame(
            'http://localhost:5173/login',
            LmsMailService::resolvePortalUrl('http://localhost:5173/dashboard')
        );
    }

    public function test_verify_login_otp_rejects_inactive_accounts(): void
    {
        Mail::fake();

        $student = User::factory()->create([
            'email' => 'inactive.otp@tcc.edu.ph',
            'role' => 'student',
            'department' => 'CIT',
            'status' => 'active',
        ]);

        $otp = app(LmsOtpService::class)->issue($student, VerificationCode::PURPOSE_LOGIN_DEVICE);
        $latest = VerificationCode::where('challenge', $otp['challenge'])->firstOrFail();
        $latest->update(['code_hash' => Hash::make('123456')]);

        $student->update(['status' => 'inactive']);

        $this->postJson('/api/verify-login-otp', [
            'challenge' => $otp['challenge'],
            'code' => '123456',
        ])->assertStatus(403);
    }
}

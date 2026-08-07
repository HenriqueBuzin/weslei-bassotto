<?php

declare(strict_types=1);

namespace Tests\Functional;

use App\Models\PasswordResetToken;
use App\Models\RefreshSession;
use App\Services\PasswordResetService;
use App\Services\RefreshSessionService;
use Illuminate\Mail\SentMessage;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

final class PasswordFlowTest extends TestCase
{
    public function test_requesting_a_reset_for_an_unknown_email_reveals_nothing(): void
    {
        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'ninguem@example.com'])
            ->assertOk()
            ->assertExactJson(['ok' => true, 'email_sent' => false, 'reset_url' => null]);

        $this->assertSame(0, PasswordResetToken::query()->count());
    }

    public function test_without_smtp_the_reset_url_is_returned_in_dev(): void
    {
        $this->createUser('aluno@example.com');

        $response = $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'Aluno@example.com'])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('email_sent', false);

        $this->assertStringContainsString('/redefinir-senha?token=', (string) $response->json('reset_url'));
        $this->assertSame(1, PasswordResetToken::query()->count());
    }

    public function test_in_production_the_reset_url_is_never_exposed(): void
    {
        Config::set('platform.env', 'prod');
        $this->createUser();

        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'aluno@example.com'])
            ->assertOk()
            ->assertJsonPath('reset_url', null);
    }

    public function test_with_smtp_configured_the_email_is_sent(): void
    {
        $this->configureSmtp();
        $this->createUser();

        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'aluno@example.com'])
            ->assertOk()
            ->assertJsonPath('email_sent', true);

        $this->assertCount(1, $this->sentMessages());
    }

    public function test_the_reset_email_carries_the_link_and_the_expiry(): void
    {
        $this->configureSmtp();
        $this->createUser();

        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'aluno@example.com'])->assertOk();

        $message = $this->sentMessages()->first()->getOriginalMessage();

        // getOriginalMessage() is typed as RawMessage; the body accessors live on Email.
        $this->assertInstanceOf(Email::class, $message);
        $this->assertStringContainsString('/redefinir-senha?token=', (string) $message->getTextBody());
        $this->assertStringContainsString('Este link expira em 30 minutos.', (string) $message->getTextBody());
        $this->assertSame('Recuperação de senha', $message->getSubject());
        $this->assertSame('aluno@example.com', $message->getTo()[0]->getAddress());
    }

    /** Mail::raw is not a Mailable, so the array transport is inspected directly. */
    private function configureSmtp(): void
    {
        Config::set('mail.mailers.smtp.username', 'robo@example.com');
        Config::set('mail.mailers.smtp.password', 'app-password');
        Config::set('mail.from.address', 'robo@example.com');
    }

    /**
     * @return Collection<int, SentMessage>
     */
    private function sentMessages(): Collection
    {
        /** @var ArrayTransport $transport */
        $transport = Mail::getSymfonyTransport();

        return $transport->messages();
    }

    public function test_requesting_a_second_reset_invalidates_the_first_token(): void
    {
        $this->createUser();

        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'aluno@example.com']);
        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'aluno@example.com']);

        $this->assertSame(2, PasswordResetToken::query()->count());
        $this->assertSame(1, PasswordResetToken::query()->whereNull('used_at')->count());
    }

    public function test_forgot_password_validates_the_email(): void
    {
        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => 'nope'])->assertStatus(422);
    }

    public function test_resetting_changes_the_password_and_revokes_every_session(): void
    {
        $user = $this->createUser('aluno@example.com', 'senha-antiga');
        app(RefreshSessionService::class)->issue($user->id, Carbon::now()->addHours(8), false);
        $token = app(PasswordResetService::class)->issueToken($user);

        $this->postJson($this->apiUrl('auth/reset-password'), [
            'token' => $token,
            'password' => 'senha-nova',
        ])->assertOk()->assertExactJson(['ok' => true]);

        $this->assertTrue(Hash::check('senha-nova', $user->refresh()->password_hash));
        $this->assertSame('password_reset', RefreshSession::query()->first()->revoke_reason);
    }

    public function test_a_reset_token_cannot_be_used_twice(): void
    {
        $user = $this->createUser();
        $token = app(PasswordResetService::class)->issueToken($user);

        $this->postJson($this->apiUrl('auth/reset-password'), ['token' => $token, 'password' => 'senha-nova'])
            ->assertOk();

        $this->postJson($this->apiUrl('auth/reset-password'), ['token' => $token, 'password' => 'outra-senha'])
            ->assertStatus(400)
            ->assertJsonPath('code', 'password_reset_token_invalid');
    }

    public function test_an_expired_reset_token_is_refused(): void
    {
        $user = $this->createUser();
        $token = app(PasswordResetService::class)->issueToken($user);
        PasswordResetToken::query()->update(['expires_at' => Carbon::now()->subMinute()]);

        $this->postJson($this->apiUrl('auth/reset-password'), ['token' => $token, 'password' => 'senha-nova'])
            ->assertStatus(400);
    }

    public function test_an_unknown_reset_token_is_refused(): void
    {
        $this->postJson($this->apiUrl('auth/reset-password'), ['token' => 'inventado', 'password' => 'senha-nova'])
            ->assertStatus(400);
    }

    public function test_resetting_validates_the_new_password_length(): void
    {
        $this->postJson($this->apiUrl('auth/reset-password'), ['token' => 'qualquer', 'password' => '123'])
            ->assertStatus(422);
    }

    public function test_an_admin_must_change_the_seeded_password_on_first_access(): void
    {
        $user = $this->createUser('admin@example.com', 'senha-inicial', ['admin'], mustChangePassword: true);

        $login = $this->post($this->apiUrl('auth/login'), [
            'username' => 'admin@example.com',
            'password' => 'senha-inicial',
        ])->assertOk();

        $this->assertTrue($login->json('must_change_password'));

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('auth/change-password'), [
                'current_password' => 'senha-inicial',
                'password' => 'senha-definitiva',
            ])
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('senha-definitiva', $user->password_hash));
    }

    public function test_changing_the_password_revokes_every_other_session(): void
    {
        $user = $this->createUser('aluno@example.com', 'senha-atual');
        app(RefreshSessionService::class)->issue($user->id, Carbon::now()->addHours(8), false);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('auth/change-password'), [
                'current_password' => 'senha-atual',
                'password' => 'senha-nova',
            ])
            ->assertOk();

        $this->assertSame('password_changed', RefreshSession::query()->first()->revoke_reason);
    }

    public function test_changing_the_password_requires_the_current_one(): void
    {
        $user = $this->createUser('aluno@example.com', 'senha-atual');

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('auth/change-password'), [
                'current_password' => 'chute-errado',
                'password' => 'senha-nova',
            ])
            ->assertStatus(400)
            ->assertJsonPath('code', 'current_password_invalid');

        $this->assertTrue(Hash::check('senha-atual', $user->refresh()->password_hash));
    }

    public function test_the_new_password_must_differ_from_the_current_one(): void
    {
        $user = $this->createUser('aluno@example.com', 'senha-atual');

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('auth/change-password'), [
                'current_password' => 'senha-atual',
                'password' => 'senha-atual',
            ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed');
    }

    public function test_changing_the_password_requires_authentication(): void
    {
        $this->postJson($this->apiUrl('auth/change-password'), [
            'current_password' => 'a',
            'password' => 'senha-nova',
        ])->assertStatus(401);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Models\LoginAttempt;
use App\Models\PasswordResetToken;
use App\Models\PaymentWebhookEvent;
use App\Models\RefreshSession;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class ConsoleCommandTest extends TestCase
{
    public function test_the_seed_creates_the_roles_and_both_admins(): void
    {
        Config::set('platform.seed_on_start', true);

        $this->runArtisan('platform:seed')->assertSuccessful();

        $this->assertSame(['admin', 'user'], Role::query()->orderBy('name')->pluck('name')->all());
        $this->assertSame(2, User::query()->count());

        foreach (User::with('roles')->get() as $admin) {
            $this->assertSame(['admin'], $admin->roleNames());
            $this->assertTrue($admin->must_change_password);
        }
    }

    public function test_the_seeded_admin_can_log_in_with_the_placeholder_password(): void
    {
        Config::set('platform.seed_on_start', true);
        $this->runArtisan('platform:seed')->assertSuccessful();

        $this->post($this->apiUrl('auth/login'), [
            'username' => 'bassottow@gmail.com',
            'password' => 'TrocarNoPrimeiroAcesso1!',
        ])->assertOk()->assertJsonPath('must_change_password', true);
    }

    public function test_the_seed_is_skipped_when_the_database_already_has_data(): void
    {
        Config::set('platform.seed_on_start', true);
        $this->createUser('existente@example.com', 'minha-senha');

        $this->runArtisan('platform:seed')
            ->expectsOutputToContain('[SEED] Database is not empty, skipping the initial load.')
            ->assertSuccessful();

        $this->assertSame(1, User::query()->count());
    }

    public function test_the_seed_never_overwrites_an_existing_admin_password(): void
    {
        Config::set('platform.seed_on_start', true);
        $admin = $this->createUser('bassottow@gmail.com', 'senha-que-eu-escolhi', ['admin']);

        $this->runArtisan('platform:seed')->assertSuccessful();

        $this->assertTrue(Hash::check('senha-que-eu-escolhi', $admin->refresh()->password_hash));
    }

    public function test_the_seed_respects_seed_on_start_being_disabled(): void
    {
        Config::set('platform.seed_on_start', false);

        $this->runArtisan('platform:seed')
            ->expectsOutputToContain('[SEED] Initial load disabled by SEED_ON_START.')
            ->assertSuccessful();

        $this->assertSame(0, User::query()->count());
    }

    public function test_the_seed_can_be_forced_past_seed_on_start(): void
    {
        Config::set('platform.seed_on_start', false);

        $this->runArtisan('platform:seed', ['--force' => true])->assertSuccessful();

        $this->assertSame(2, User::query()->count());
    }

    public function test_the_hash_command_prints_a_verifiable_argon2id_hash(): void
    {
        $this->assertSame(0, Artisan::call('platform:hash', ['password' => 'minha-senha']));

        $this->assertTrue(Hash::check('minha-senha', trim(Artisan::output())));
    }

    public function test_pruning_removes_expired_records_and_keeps_the_live_ones(): void
    {
        $user = $this->createUser();
        $now = Carbon::now();

        $this->refreshSession($user->id, $now->copy()->subMinute());
        $this->refreshSession($user->id, $now->copy()->addDay());
        $this->resetToken($user->id, $now->copy()->subMinute());
        $this->resetToken($user->id, $now->copy()->addHour());
        $this->loginAttempt('velho@example.com', $now->copy()->subMinute());
        $this->loginAttempt('novo@example.com', $now->copy()->addHour());
        $this->webhookEvent('antigo', $now->copy()->subDays(120));
        $this->webhookEvent('recente', $now->copy()->subDay());

        $this->runArtisan('platform:prune')->assertSuccessful();

        $this->assertSame(1, RefreshSession::query()->count());
        $this->assertSame(1, PasswordResetToken::query()->count());
        $this->assertSame(['novo@example.com'], LoginAttempt::query()->pluck('email')->all());
        $this->assertSame(['recente'], PaymentWebhookEvent::query()->pluck('event_id')->all());
    }

    public function test_the_webhook_retention_window_is_configurable(): void
    {
        $this->webhookEvent('de-ontem', Carbon::now()->subDay());

        $this->runArtisan('platform:prune', ['--webhook-retention-days' => 0])->assertSuccessful();

        $this->assertSame(0, PaymentWebhookEvent::query()->count());
    }

    public function test_pruning_an_empty_database_reports_zero(): void
    {
        $this->runArtisan('platform:prune')
            ->expectsOutputToContain('[PRUNE] refresh_sessions: 0')
            ->assertSuccessful();
    }

    private function refreshSession(string $userId, Carbon $expiresAt): void
    {
        RefreshSession::query()->create([
            'user_id' => $userId,
            'jti_hash' => hash('sha256', uniqid('', true)),
            'remember' => false,
            'created_at' => Carbon::now(),
            'expires_at' => $expiresAt,
        ]);
    }

    public function test_the_health_command_succeeds_while_the_database_answers(): void
    {
        $this->runArtisan('platform:health')->expectsOutputToContain('[HEALTH] ok')->assertSuccessful();
    }

    /**
     * Compose gates the production container on this exit code, so a database it
     * cannot reach must fail rather than report a healthy release.
     */
    public function test_the_health_command_fails_when_the_database_is_unreachable(): void
    {
        DB::shouldReceive('connection')->andThrow(new \RuntimeException('connection refused'));

        $this->runArtisan('platform:health')
            ->expectsOutputToContain('database unreachable')
            ->assertFailed();
    }

    private function resetToken(string $userId, Carbon $expiresAt): void
    {
        PasswordResetToken::query()->create([
            'user_id' => $userId,
            'token_hash' => hash('sha256', uniqid('', true)),
            'created_at' => Carbon::now(),
            'expires_at' => $expiresAt,
        ]);
    }

    private function loginAttempt(string $email, Carbon $expiresAt): void
    {
        LoginAttempt::query()->create([
            'email' => $email,
            'attempts' => 1,
            'started_at' => Carbon::now(),
            'expires_at' => $expiresAt,
        ]);
    }

    private function webhookEvent(string $eventId, Carbon $receivedAt): void
    {
        PaymentWebhookEvent::query()->create([
            'gateway' => 'mercado_pago',
            'event_id' => $eventId,
            'external_id' => 'mp-1',
            'received_at' => $receivedAt,
            'matched' => true,
        ]);
    }
}

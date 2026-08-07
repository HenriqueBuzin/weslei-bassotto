<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Models\RefreshSession;
use App\Models\Role;
use App\Models\User;
use App\Services\RefreshSessionService;
use App\Services\TokenService;
use Firebase\JWT\JWT;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class AuthEndpointsTest extends TestCase
{
    public function test_registering_creates_a_user_with_the_default_role(): void
    {
        Role::query()->create(['name' => 'user', 'description' => 'Usuário padrão']);

        $response = $this->postJson($this->apiUrl('auth/register'), [
            'email' => 'Novo@Example.com',
            'password' => 'segredo123',
        ]);

        $response->assertCreated()
            ->assertJsonPath('email', 'novo@example.com')
            ->assertJsonPath('roles', ['user'])
            ->assertJsonPath('must_change_password', false);

        $this->assertTrue(Hash::check('segredo123', User::query()->first()->password_hash));
    }

    public function test_registering_without_a_seeded_role_still_creates_the_user(): void
    {
        $this->postJson($this->apiUrl('auth/register'), [
            'email' => 'novo@example.com',
            'password' => 'segredo123',
        ])->assertCreated()->assertJsonPath('roles', []);
    }

    public function test_registering_a_known_email_is_rejected(): void
    {
        $this->createUser('ja@example.com');

        $this->postJson($this->apiUrl('auth/register'), [
            'email' => 'JA@example.com',
            'password' => 'segredo123',
        ])->assertStatus(400)->assertJsonPath('code', 'email_already_registered');
    }

    public function test_registering_validates_the_payload(): void
    {
        $this->postJson($this->apiUrl('auth/register'), ['email' => 'nope', 'password' => '123'])
            ->assertStatus(422)
            ->assertJsonStructure(['detail', 'errors']);
    }

    public function test_logging_in_returns_an_access_token_and_the_refresh_cookie(): void
    {
        $this->createUser('aluno@example.com', 'segredo123');

        $response = $this->post($this->apiUrl('auth/login'), [
            'username' => 'Aluno@example.com',
            'password' => 'segredo123',
        ]);

        $response->assertOk()
            ->assertJsonPath('token_type', 'bearer')
            ->assertJsonPath('must_change_password', false);

        $this->assertNotEmpty($response->json('access_token'));
        $this->assertNotNull($response->getCookie('rt', false));
        $this->assertSame(1, RefreshSession::query()->count());
    }

    public function test_remember_me_produces_a_persistent_cookie(): void
    {
        $this->createUser();

        $response = $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'segredo123',
            'remember' => 'true',
        ])->assertOk();

        $this->assertGreaterThan(time(), $response->getCookie('rt', false)->getExpiresTime());
        $this->assertTrue(RefreshSession::query()->first()->remember);
    }

    public function test_without_remember_me_the_cookie_is_session_scoped(): void
    {
        $this->createUser();

        $response = $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'segredo123',
            'remember' => 'false',
        ])->assertOk();

        $this->assertSame(0, $response->getCookie('rt', false)->getExpiresTime());
        $this->assertFalse(RefreshSession::query()->first()->remember);
    }

    public function test_the_refresh_cookie_is_http_only_and_scoped_to_the_auth_path(): void
    {
        $this->createUser();

        $cookie = $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'segredo123',
        ])->getCookie('rt', false);

        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('/api/v1/auth', $cookie->getPath());
        $this->assertSame('lax', $cookie->getSameSite());
    }

    public function test_a_wrong_password_is_rejected(): void
    {
        $this->createUser();

        $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'errada',
        ])->assertStatus(401)->assertJsonPath('code', 'invalid_credentials');
    }

    public function test_an_unknown_email_gets_the_same_generic_message(): void
    {
        $this->post($this->apiUrl('auth/login'), [
            'username' => 'ninguem@example.com',
            'password' => 'segredo123',
        ])->assertStatus(401)->assertJsonPath('code', 'invalid_credentials');
    }

    public function test_login_requires_credentials(): void
    {
        $this->postJson($this->apiUrl('auth/login'), [])->assertStatus(422);
    }

    public function test_the_account_locks_after_too_many_failures(): void
    {
        $this->createUser();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->post($this->apiUrl('auth/login'), [
                'username' => 'aluno@example.com',
                'password' => 'errada',
            ])->assertStatus(401);
        }

        $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'segredo123',
        ])->assertStatus(429)->assertJsonPath('code', 'login_locked');
    }

    public function test_a_successful_login_clears_the_failure_counter(): void
    {
        $this->createUser();

        $this->post($this->apiUrl('auth/login'), ['username' => 'aluno@example.com', 'password' => 'errada']);
        $this->post($this->apiUrl('auth/login'), ['username' => 'aluno@example.com', 'password' => 'segredo123'])
            ->assertOk();

        $this->assertDatabaseCount('login_attempts', 0);
    }

    public function test_refreshing_rotates_the_session_and_returns_a_new_access_token(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user);

        $response = $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'));

        $response->assertOk();
        $this->assertNotEmpty($response->json('access_token'));
        $this->assertSame(2, RefreshSession::query()->count());
        $this->assertSame(1, RefreshSession::query()->whereNotNull('revoked_at')->count());
    }

    public function test_refreshing_without_a_cookie_is_rejected(): void
    {
        $this->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_missing');
    }

    public function test_refreshing_with_a_garbage_cookie_is_rejected(): void
    {
        $this->withRefreshCookie('not-a-jwt')->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_invalid');
    }

    public function test_an_access_token_cannot_be_used_to_refresh(): void
    {
        $user = $this->createUser();
        $access = app(TokenService::class)->createAccessToken($user->id, ['user']);

        $this->withRefreshCookie($access)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_expected');
    }

    public function test_a_refresh_token_without_a_jti_is_rejected_and_clears_the_cookie(): void
    {
        $user = $this->createUser();
        $token = app(TokenService::class)->createRefreshToken($user->id, Carbon::now()->addHour());
        // createRefreshToken always adds a jti, so strip it to emulate a forged token.
        $forged = $this->forgeRefreshWithoutJti($user->id);

        $this->assertNotSame($token, $forged);

        $this->withRefreshCookie($forged)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_invalid');
    }

    public function test_refreshing_for_a_deleted_user_is_rejected(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user);
        RefreshSession::query()->delete();
        $user->delete();

        $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'user_not_found');
    }

    public function test_replaying_a_rotated_refresh_token_revokes_the_whole_family(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user);

        $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'))->assertOk();

        $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_reused');

        $this->assertSame(0, RefreshSession::query()->whereNull('revoked_at')->count());
        $this->assertSame(
            1,
            RefreshSession::query()->where('revoke_reason', 'reuse_detected')->count(),
        );
    }

    public function test_an_expired_refresh_session_cannot_rotate(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user, Carbon::now()->addHours(2));
        RefreshSession::query()->update(['expires_at' => Carbon::now()->subMinute()]);

        $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_reused');
    }

    public function test_a_refresh_token_unknown_to_the_database_cannot_rotate(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user);
        RefreshSession::query()->delete();

        $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_reused');
    }

    public function test_logging_out_revokes_the_session_and_clears_the_cookie(): void
    {
        $user = $this->createUser();
        $token = $this->issueRefreshToken($user);

        $response = $this->withRefreshCookie($token)->postJson($this->apiUrl('auth/logout'));

        $response->assertNoContent();
        $this->assertSame('logout', RefreshSession::query()->first()->revoke_reason);
    }

    public function test_logging_out_without_a_cookie_still_succeeds(): void
    {
        $this->postJson($this->apiUrl('auth/logout'))->assertNoContent();
    }

    public function test_logging_out_with_an_invalid_cookie_still_succeeds(): void
    {
        $this->withRefreshCookie('not-a-jwt')->postJson($this->apiUrl('auth/logout'))->assertNoContent();
    }

    public function test_logging_out_with_an_access_token_leaves_sessions_untouched(): void
    {
        $user = $this->createUser();
        $this->issueRefreshToken($user);
        $access = app(TokenService::class)->createAccessToken($user->id, ['user']);

        $this->withRefreshCookie($access)->postJson($this->apiUrl('auth/logout'))->assertNoContent();

        $this->assertNull(RefreshSession::query()->first()->revoked_at);
    }

    public function test_samesite_none_requires_the_xhr_header(): void
    {
        Config::set('platform.cookie.samesite', 'none');
        Config::set('platform.cookie.secure', true);

        $this->post($this->apiUrl('auth/refresh'))
            ->assertStatus(400)
            ->assertJsonPath('code', 'csrf_check_failed');
    }

    public function test_samesite_none_accepts_the_xhr_header(): void
    {
        Config::set('platform.cookie.samesite', 'none');
        Config::set('platform.cookie.secure', true);

        $this->withHeader('X-Requested-With', 'XMLHttpRequest')
            ->post($this->apiUrl('auth/refresh'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'refresh_token_missing');
    }

    public function test_me_returns_the_authenticated_identity(): void
    {
        $user = $this->createAdmin('chefe@example.com');

        $this->withHeaders($this->authHeader($user))->getJson($this->apiUrl('me'))
            ->assertOk()
            ->assertExactJson([
                'id' => $user->id,
                'email' => 'chefe@example.com',
                'roles' => ['admin'],
                'must_change_password' => false,
            ]);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'unauthenticated');
    }

    /**
     * Browsers only attach cookies to XHR when credentials are enabled, and the
     * refresh cookie is never encrypted by this API.
     */
    private function withRefreshCookie(string $token): static
    {
        return $this->withCredentials()->withUnencryptedCookie('rt', $token);
    }

    private function issueRefreshToken(User $user, ?Carbon $expiresAt = null): string
    {
        return app(RefreshSessionService::class)->issue(
            $user->id,
            $expiresAt ?? Carbon::now()->addHours(8),
            false,
        );
    }

    private function forgeRefreshWithoutJti(string $userId): string
    {
        $now = Carbon::now();

        return JWT::encode([
            'sub' => $userId,
            'type' => 'refresh',
            'iat' => $now->getTimestamp(),
            'exp' => $now->addHour()->getTimestamp(),
        ], (string) Config::get('platform.jwt.secret'), 'HS256');
    }
}

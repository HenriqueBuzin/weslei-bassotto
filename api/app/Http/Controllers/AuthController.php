<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\Auth\ChangePasswordRequest;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\Role;
use App\Models\User;
use App\Services\LoginThrottleService;
use App\Services\RefreshSessionService;
use App\Services\TokenService;
use App\Support\RefreshCookie;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(
        private readonly TokenService $tokens,
        private readonly RefreshSessionService $sessions,
        private readonly LoginThrottleService $throttle,
    ) {}

    public function login(LoginRequest $request): JsonResponse
    {
        $email = strtolower(trim($request->string('username')->value()));
        $remember = $request->boolean('remember');

        if ($this->throttle->isLocked($email)) {
            throw ApiException::tooManyRequests('login_locked', 'Too many failed attempts, try again in a few minutes');
        }

        $user = User::with('roles')->where('email', $email)->first();

        if ($user === null || ! Hash::check($request->string('password')->value(), $user->password_hash)) {
            $this->throttle->registerFailure($email);

            throw ApiException::unauthorized('invalid_credentials', 'Invalid e-mail or password');
        }

        $this->throttle->clear($email);

        $expiresAt = $this->refreshExpiry($remember);
        $refreshToken = $this->sessions->issue($user->id, $expiresAt, $remember);

        return $this->withRefreshCookie(
            new JsonResponse([
                'access_token' => $this->tokens->createAccessToken($user->id, $user->roleNames()),
                'token_type' => 'bearer',
                'must_change_password' => $user->must_change_password,
            ]),
            $refreshToken,
            $remember,
            $expiresAt,
        );
    }

    public function refresh(Request $request): JsonResponse
    {
        $this->guardCsrf($request);

        $token = $request->cookie(RefreshCookie::name());

        if (! is_string($token) || $token === '') {
            throw ApiException::unauthorized('refresh_token_missing', 'No refresh token was sent');
        }

        $payload = $this->tokens->decode($token);

        if ($payload === null) {
            throw ApiException::unauthorized('refresh_token_invalid', 'The refresh token is invalid');
        }

        if (($payload['type'] ?? null) !== 'refresh') {
            throw ApiException::unauthorized('refresh_token_expected', 'A refresh token is required here');
        }

        $identity = $this->sessions->identity($payload);

        if ($identity === null) {
            return $this->cleared(ApiException::unauthorized('refresh_token_invalid', 'The refresh token is invalid'));
        }

        $user = User::with('roles')->find($identity[0]);

        if ($user === null) {
            return $this->cleared(ApiException::unauthorized('user_not_found', 'The account no longer exists'));
        }

        $remember = (bool) ($payload['rm'] ?? 0);
        $expiresAt = $this->refreshExpiry($remember);
        $rotated = $this->sessions->rotate($payload, $expiresAt);

        if ($rotated === null) {
            return $this->cleared(ApiException::unauthorized('refresh_token_reused', 'The refresh token is expired, revoked or was replayed'));
        }

        return $this->withRefreshCookie(
            new JsonResponse([
                'access_token' => $this->tokens->createAccessToken($user->id, $user->roleNames()),
                'token_type' => 'bearer',
                // O refresh tambem carrega a flag: sem ela, um F5 renovaria a
                // sessao sem o aviso e o admin escaparia da troca obrigatoria.
                'must_change_password' => $user->must_change_password,
            ]),
            $rotated,
            $remember,
            $expiresAt,
        );
    }

    public function logout(Request $request): Response
    {
        $this->guardCsrf($request);

        $token = $request->cookie(RefreshCookie::name());

        if (is_string($token) && $token !== '') {
            $payload = $this->tokens->decode($token);

            if ($payload !== null && ($payload['type'] ?? null) === 'refresh') {
                $this->sessions->revoke($payload);
            }
        }

        return (new Response('', 204))->withCookie(RefreshCookie::forget());
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $email = strtolower(trim($request->string('email')->value()));

        if (User::query()->where('email', $email)->exists()) {
            throw ApiException::badRequest('email_already_registered', 'This e-mail is already registered');
        }

        $user = User::query()->create([
            'email' => $email,
            'password_hash' => Hash::make($request->string('password')->value()),
        ]);

        $userRole = Role::query()->where('name', 'user')->first();

        if ($userRole !== null) {
            $user->roles()->attach($userRole->id);
        }

        return UserResource::make($user->load('roles'))->response()->setStatusCode(201);
    }

    /**
     * Used both for the forced change on an admin's first access and for a
     * voluntary change. Every other session is revoked afterwards.
     */
    public function changePassword(ChangePasswordRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! Hash::check($request->string('current_password')->value(), $user->password_hash)) {
            throw ApiException::badRequest('current_password_invalid', 'The current password does not match');
        }

        $user->fill([
            'password_hash' => Hash::make($request->string('password')->value()),
            'must_change_password' => false,
        ])->save();

        $this->sessions->revokeAllForUser($user->id, 'password_changed');

        return (new JsonResponse(['ok' => true]))->withCookie(RefreshCookie::forget());
    }

    /**
     * With SameSite=None a plain HTML form could carry the refresh cookie, so a
     * header no form can set is required.
     */
    private function guardCsrf(Request $request): void
    {
        if (Config::get('platform.cookie.samesite') === 'none'
            && $request->header('x-requested-with') !== 'XMLHttpRequest') {
            throw ApiException::badRequest('csrf_check_failed', 'The CSRF check failed');
        }
    }

    private function refreshExpiry(bool $remember): Carbon
    {
        return $remember
            ? Carbon::now()->addDays((int) Config::get('platform.jwt.refresh_expires_long_days'))
            : Carbon::now()->addHours((int) Config::get('platform.jwt.refresh_expires_short_hours'));
    }

    private function withRefreshCookie(
        JsonResponse $response,
        string $token,
        bool $remember,
        Carbon $expiresAt,
    ): JsonResponse {
        $lifetime = $remember ? (int) Carbon::now()->diffInSeconds($expiresAt, absolute: true) : null;

        return $response->withCookie(RefreshCookie::make($token, $lifetime));
    }

    private function cleared(ApiException $exception): JsonResponse
    {
        return $exception->toResponse(request())->withCookie(RefreshCookie::forget());
    }
}

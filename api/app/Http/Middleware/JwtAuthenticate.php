<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\TokenService;
use App\Support\RecordId;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class JwtAuthenticate
{
    public function __construct(private readonly TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if ($token === null || $token === '') {
            return $this->unauthorized('unauthenticated', 'No credentials were sent');
        }

        $payload = $this->tokens->decode($token);

        if ($payload === null) {
            return $this->unauthorized('access_token_invalid', 'The access token is invalid');
        }

        if (($payload['type'] ?? null) !== 'access') {
            return $this->unauthorized('access_token_expected', 'An access token is required here');
        }

        $subject = RecordId::normalize($payload['sub'] ?? null);

        if ($subject === null) {
            return $this->unauthorized('access_token_invalid', 'The access token has no subject');
        }

        $user = User::with('roles')->find($subject);

        if ($user === null) {
            return $this->unauthorized('user_not_found', 'The account no longer exists');
        }

        $request->setUserResolver(fn (): User => $user);

        return $next($request);
    }

    private function unauthorized(string $code, string $detail): JsonResponse
    {
        return new JsonResponse(
            ['code' => $code, 'detail' => $detail],
            401,
            ['WWW-Authenticate' => 'Bearer'],
        );
    }
}

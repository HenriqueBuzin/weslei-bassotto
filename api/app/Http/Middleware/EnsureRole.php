<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasAnyRole(...$roles)) {
            return new JsonResponse(
                ['code' => 'forbidden_role', 'detail' => 'This account lacks the required role'],
                403,
            );
        }

        return $next($request);
    }
}

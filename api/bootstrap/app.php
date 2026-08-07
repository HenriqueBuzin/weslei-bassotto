<?php

declare(strict_types=1);

use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\JwtAuthenticate;
use App\Support\EnvSecrets;
use App\Support\PlatformEnv;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

EnvSecrets::hydrate();

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        apiPrefix: ltrim(PlatformEnv::apiBase(env('API_BASE', '/api/v1')), '/'),
        commands: __DIR__.'/../routes/console.php',
        then: function (): void {
            require __DIR__.'/../routes/health.php';
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [HandleCors::class]);

        $middleware->alias([
            'jwt' => JwtAuthenticate::class,
            'role' => EnsureRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // The frontend translates `code`; `fields` tells it which inputs failed.
        $exceptions->render(function (ValidationException $exception): JsonResponse {
            return new JsonResponse([
                'code' => 'validation_failed',
                'detail' => $exception->validator->errors()->first(),
                'fields' => array_keys($exception->errors()),
                'errors' => $exception->errors(),
            ], 422);
        });

        $exceptions->render(function (HttpExceptionInterface $exception): JsonResponse {
            $status = $exception->getStatusCode();

            return new JsonResponse([
                'code' => $status === 404 ? 'route_not_found' : 'request_failed',
                'detail' => $exception->getMessage(),
            ], $status);
        });
    })
    ->create();

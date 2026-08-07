<?php

declare(strict_types=1);

use App\Support\PlatformEnv;

return [

    'env' => PlatformEnv::appEnv(env('APP_ENV', 'prod')),

    'api_base' => PlatformEnv::apiBase(env('API_BASE', '/api/v1')),

    'database_url' => (string) env('DATABASE_URL', ''),

    'cors_allowed_origins' => PlatformEnv::origins(env('CORS_ALLOWED_ORIGINS', '')),

    'seed_on_start' => PlatformEnv::bool(env('SEED_ON_START'), false),

    'jwt' => [
        'algorithm' => strtoupper((string) env('JWT_ALG', 'HS256')),
        'secret' => (string) env('JWT_SECRET', ''),
        'access_expires_minutes' => (int) env('ACCESS_TOKEN_EXPIRES_MINUTES', 15),
        'refresh_expires_short_hours' => (int) env('REFRESH_TOKEN_EXPIRES_SHORT_HOURS', 8),
        'refresh_expires_long_days' => (int) env('REFRESH_TOKEN_EXPIRES_LONG_DAYS', 30),
    ],

    'login' => [
        'max_attempts' => (int) env('LOGIN_MAX_ATTEMPTS', 5),
        'window_minutes' => (int) env('LOGIN_ATTEMPT_WINDOW_MINUTES', 15),
        'lock_minutes' => (int) env('LOGIN_LOCK_MINUTES', 15),
    ],

    'cookie' => [
        'domain' => PlatformEnv::nullableString(env('COOKIE_DOMAIN')),
        'secure' => PlatformEnv::bool(env('COOKIE_SECURE'), true),
        'samesite' => strtolower(trim((string) env('COOKIE_SAMESITE', 'lax'))),
        'refresh_name' => trim((string) env('REFRESH_COOKIE_NAME', 'rt')),
        'refresh_path' => PlatformEnv::cookiePath(env('REFRESH_COOKIE_PATH', '/')),
    ],

    'password_reset' => [
        'expires_minutes' => (int) env('PASSWORD_RESET_EXPIRES_MINUTES', 30),
    ],

    'payments' => [
        'gateway_order' => PlatformEnv::gatewayOrder(env('PAYMENT_GATEWAY_ORDER', 'mercado_pago')),
        'mercado_pago' => [
            'access_token' => (string) env('MERCADO_PAGO_ACCESS_TOKEN', ''),
            'webhook_secret' => (string) env('MERCADO_PAGO_WEBHOOK_SECRET', ''),
        ],
    ],

];

<?php

declare(strict_types=1);

use App\Support\PlatformEnv;

$useSsl = PlatformEnv::bool(env('SMTP_USE_SSL'), false);
$useTls = PlatformEnv::bool(env('SMTP_USE_TLS'), true);
$user = (string) env('SMTP_USER', '');

return [

    'default' => env('MAIL_MAILER', 'smtp'),

    'mailers' => [

        'smtp' => [
            'transport' => 'smtp',
            'scheme' => $useSsl ? 'smtps' : 'smtp',
            'host' => (string) env('SMTP_HOST', 'smtp.gmail.com'),
            'port' => (int) env('SMTP_PORT', 587),
            'username' => $user,
            'password' => (string) env('SMTP_PASSWORD', ''),
            'timeout' => 20,
            'tls_required' => $useTls && ! $useSsl,
        ],

        'array' => [
            'transport' => 'array',
        ],

        'log' => [
            'transport' => 'log',
        ],

    ],

    'from' => [
        'address' => (string) env('SMTP_FROM', '') ?: $user,
        'name' => 'Weslei Bassotto',
    ],

];

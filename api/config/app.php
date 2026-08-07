<?php

declare(strict_types=1);

use App\Support\PlatformEnv;

$environment = PlatformEnv::appEnv(env('APP_ENV', 'prod'));

return [

    'name' => 'Weslei Bassotto API',

    'env' => $environment,

    'debug' => $environment === 'dev',

    'url' => rtrim((string) env('APP_URL', 'http://localhost'), '/'),

    'timezone' => 'UTC',

    // pt_BR carries the copy users read, which today is the password reset mail.
    'locale' => 'pt_BR',

    // English on purpose: lang/pt_BR only overrides that mail, so framework
    // strings such as validation messages have to fall back somewhere real.
    // Pointing the fallback at pt_BR left `detail` as the raw "validation.required".
    'fallback_locale' => 'en',

    'cipher' => 'AES-256-CBC',

    'key' => env('APP_KEY'),

    'previous_keys' => [],

    'maintenance' => [
        'driver' => 'file',
    ],

];

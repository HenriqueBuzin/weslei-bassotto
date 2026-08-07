<?php

declare(strict_types=1);

use App\Support\PlatformEnv;

// Config files load alphabetically, so this reads the environment directly
// instead of depending on config('platform') being populated already.
$origins = PlatformEnv::origins(env('CORS_ALLOWED_ORIGINS', ''));

return [

    'paths' => ['*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $origins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => $origins !== ['*'],

];

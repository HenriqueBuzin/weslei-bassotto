<?php

declare(strict_types=1);

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/**
 * Honest on purpose: compose and Jenkins gate a deploy on `up -d --wait`, so a
 * container that cannot reach its database must report itself unhealthy rather
 * than let a broken release pass as green.
 */
$health = static function (): JsonResponse {
    try {
        DB::connection()->getPdo()->query('SELECT 1');
    } catch (Throwable) {
        return new JsonResponse(['status' => 'error', 'database' => 'unreachable'], 503);
    }

    return new JsonResponse(['status' => 'ok', 'database' => 'ok']);
};

Route::get('/health', $health);
Route::get(Config::get('platform.api_base').'/health', $health);

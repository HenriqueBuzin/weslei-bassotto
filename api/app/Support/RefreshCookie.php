<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\Config;
use Symfony\Component\HttpFoundation\Cookie;

/**
 * Builds the HttpOnly refresh cookie. A null lifetime means a session cookie
 * that disappears when the browser closes ("remember me" turned off).
 */
final class RefreshCookie
{
    public static function name(): string
    {
        return (string) Config::get('platform.cookie.refresh_name');
    }

    /**
     * PlatformEnv já rejeita qualquer outro valor na subida, mas o Symfony aceita
     * apenas estes literais, então a leitura do config é estreitada aqui.
     *
     * @return ''|'lax'|'none'|'strict'
     */
    private static function sameSite(): string
    {
        $value = strtolower((string) Config::get('platform.cookie.samesite'));

        return match ($value) {
            'none' => 'none',
            'strict' => 'strict',
            default => 'lax',
        };
    }

    public static function make(string $token, ?int $lifetimeSeconds): Cookie
    {
        return Cookie::create(self::name())
            ->withValue($token)
            ->withExpires($lifetimeSeconds === null ? 0 : time() + $lifetimeSeconds)
            ->withPath((string) Config::get('platform.cookie.refresh_path'))
            ->withDomain(Config::get('platform.cookie.domain'))
            ->withSecure((bool) Config::get('platform.cookie.secure'))
            ->withHttpOnly(true)
            ->withSameSite(self::sameSite());
    }

    public static function forget(): Cookie
    {
        return Cookie::create(self::name())
            ->withValue('')
            ->withExpires(1)
            ->withPath((string) Config::get('platform.cookie.refresh_path'))
            ->withDomain(Config::get('platform.cookie.domain'))
            ->withSecure((bool) Config::get('platform.cookie.secure'))
            ->withHttpOnly(true)
            ->withSameSite(self::sameSite());
    }
}

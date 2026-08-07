<?php

declare(strict_types=1);

namespace App\Providers;

use App\Payments\GatewayRegistry;
use App\Payments\MercadoPagoGateway;
use App\Services\TokenService;
use App\Support\PlatformEnv;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(TokenService::class, fn (): TokenService => new TokenService(
            (string) Config::get('platform.jwt.secret'),
            (string) Config::get('platform.jwt.algorithm'),
            (int) Config::get('platform.jwt.access_expires_minutes'),
        ));

        $this->app->singleton(GatewayRegistry::class, fn (): GatewayRegistry => new GatewayRegistry(
            [new MercadoPagoGateway(
                (string) Config::get('platform.payments.mercado_pago.access_token'),
                (string) Config::get('app.url'),
            )],
            array_values(array_map('strval', (array) Config::get('platform.payments.gateway_order'))),
        ));
    }

    public function boot(): void
    {
        PlatformEnv::validate(Config::get('platform'));

        // The frontend consumes bare arrays, never a `data` envelope.
        JsonResource::withoutWrapping();
    }
}

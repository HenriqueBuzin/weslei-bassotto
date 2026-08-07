<?php

declare(strict_types=1);

namespace App\Payments;

interface PaymentGateway
{
    public function name(): string;

    public function createCharge(ChargeRequest $request): ChargeResult;

    /**
     * @param  array<string, mixed>  $payload
     */
    public function parseWebhook(array $payload): ?WebhookEvent;
}

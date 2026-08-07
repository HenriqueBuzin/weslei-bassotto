<?php

declare(strict_types=1);

namespace App\Payments;

final readonly class WebhookEvent
{
    public function __construct(
        public string $eventId,
        public string $externalId,
        public PaymentStatus $status,
        public ?string $statusDetail = null,
    ) {}
}

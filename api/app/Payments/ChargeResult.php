<?php

declare(strict_types=1);

namespace App\Payments;

final readonly class ChargeResult
{
    public function __construct(
        public string $gateway,
        public string $externalId,
        public PaymentStatus $status,
        public ?string $statusDetail = null,
    ) {}
}

<?php

declare(strict_types=1);

namespace App\Payments;

final readonly class ChargeRequest
{
    public function __construct(
        public string $reference,
        public string $description,
        public string $amount,
        public string $payerEmail,
        public string $cardToken,
        public ?string $paymentMethodId,
        public string $mode,
        public int $installments,
    ) {}
}

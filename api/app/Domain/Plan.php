<?php

declare(strict_types=1);

namespace App\Domain;

final readonly class Plan
{
    public function __construct(
        public string $slug,
        public string $name,
        public int $months,
        public string $cashAmount,
        public string $subscriptionTotal,
        public string $monthlyAmount,
    ) {}

    public function amountFor(string $mode): string
    {
        return $mode === 'cash' ? $this->cashAmount : $this->monthlyAmount;
    }
}

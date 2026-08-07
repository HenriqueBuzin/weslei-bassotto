<?php

declare(strict_types=1);

namespace App\Payments;

enum PaymentStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Failed = 'failed';
    case Cancelled = 'cancelled';

    public static function fromGateway(?string $value): self
    {
        return match (strtolower((string) $value)) {
            'approved', 'authorized', 'active' => self::Approved,
            'cancelled', 'canceled' => self::Cancelled,
            'rejected', 'paused', 'expired' => self::Failed,
            default => self::Pending,
        };
    }
}

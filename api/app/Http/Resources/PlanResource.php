<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Domain\Plan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Plan */
class PlanResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->slug,
            'name' => $this->name,
            'months' => $this->months,
            'cash' => $this->cashAmount,
            'subscription_total' => $this->subscriptionTotal,
            'monthly' => $this->monthlyAmount,
        ];
    }
}

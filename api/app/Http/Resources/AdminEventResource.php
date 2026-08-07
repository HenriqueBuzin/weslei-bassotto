<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AdminEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AdminEvent */
class AdminEventResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'submission_id' => (string) $this->submission_id,
            'payment_id' => (string) $this->payment_id,
            'seen_at' => $this->seen_at?->toIso8601String(),
            'created_at' => $this->created_at->toIso8601String(),
        ];
    }
}

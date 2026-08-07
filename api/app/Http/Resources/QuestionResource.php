<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ConsultancyQuestion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ConsultancyQuestion */
class QuestionResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'label' => $this->label,
            'type' => $this->type,
            'options' => $this->options,
            'required' => $this->required,
            'active' => $this->active,
            'order' => $this->position,
            'created_at' => $this->created_at->toIso8601String(),
            'updated_at' => $this->updated_at->toIso8601String(),
        ];
    }
}

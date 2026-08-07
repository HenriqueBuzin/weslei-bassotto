<?php

declare(strict_types=1);

namespace App\Http\Requests\Consultancy;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmissionUpdateRequest extends FormRequest
{
    public const STATUSES = ['pending_payment', 'paid', 'active', 'finished', 'cancelled'];

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => ['sometimes', 'nullable', Rule::in(self::STATUSES)],
            'start_date' => ['sometimes', 'nullable', 'date'],
            'end_date' => ['sometimes', 'nullable', 'date'],
            'payment_reference' => ['sometimes', 'nullable', 'string'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function patch(): array
    {
        $map = [
            'status' => 'status',
            'payment_reference' => 'payment_reference',
            'start_date' => 'plan_start_date',
            'end_date' => 'plan_end_date',
        ];

        $patch = [];

        foreach ($map as $input => $column) {
            if ($this->has($input)) {
                $patch[$column] = $this->input($input);
            }
        }

        return $patch;
    }
}

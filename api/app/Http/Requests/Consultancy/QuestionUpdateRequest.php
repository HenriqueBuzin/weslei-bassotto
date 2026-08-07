<?php

declare(strict_types=1);

namespace App\Http\Requests\Consultancy;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class QuestionUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'label' => ['sometimes', 'string', 'min:3', 'max:220'],
            'type' => ['sometimes', Rule::in(QuestionStoreRequest::TYPES)],
            'options' => ['sometimes', 'array'],
            'options.*' => ['string'],
            'required' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'order' => ['sometimes', 'integer'],
        ];
    }

    /**
     * Only the keys the client actually sent, translated to column names.
     *
     * @return array<string, mixed>
     */
    public function patch(): array
    {
        $map = [
            'label' => 'label',
            'type' => 'type',
            'options' => 'options',
            'required' => 'required',
            'active' => 'active',
            'order' => 'position',
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

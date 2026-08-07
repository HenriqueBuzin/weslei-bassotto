<?php

declare(strict_types=1);

namespace App\Http\Requests\Consultancy;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class QuestionStoreRequest extends FormRequest
{
    public const TYPES = ['text', 'textarea', 'number', 'select', 'boolean'];

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'label' => ['required', 'string', 'min:3', 'max:220'],
            'type' => ['sometimes', Rule::in(self::TYPES)],
            'options' => ['sometimes', 'array'],
            'options.*' => ['string'],
            'required' => ['sometimes', 'boolean'],
            'active' => ['sometimes', 'boolean'],
            'order' => ['sometimes', 'integer'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function toColumns(): array
    {
        return [
            'label' => $this->string('label')->value(),
            'type' => $this->input('type', 'textarea'),
            'options' => $this->input('options', []),
            'required' => $this->boolean('required', true),
            'active' => $this->boolean('active', true),
            'position' => (int) $this->input('order', 0),
        ];
    }
}

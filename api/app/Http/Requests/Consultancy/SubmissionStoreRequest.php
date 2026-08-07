<?php

declare(strict_types=1);

namespace App\Http\Requests\Consultancy;

use App\Domain\PlanCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class SubmissionStoreRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'plan_slug' => ['required', Rule::in(PlanCatalog::SLUGS)],
            'customer.name' => ['required', 'string', 'min:2', 'max:120'],
            'customer.email' => ['required', 'email'],
            'customer.phone' => ['required', 'string', 'min:8', 'max:30'],
            'answers' => ['present', 'array'],
            'answers.*.question_id' => ['required', 'string'],
            'payment_id' => ['required', 'string'],
            'payment_token' => ['required', 'string'],
        ];
    }

    /**
     * @return list<array{question_id: string, value: mixed}>
     */
    public function answers(): array
    {
        $answers = $this->input('answers', []);

        return array_values(array_map(fn (array $answer): array => [
            'question_id' => (string) $answer['question_id'],
            'value' => $answer['value'] ?? null,
        ], is_array($answers) ? $answers : []));
    }
}

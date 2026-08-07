<?php

declare(strict_types=1);

namespace App\Http\Requests\Consultancy;

use Illuminate\Foundation\Http\FormRequest;

class AnswersUpdateRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'answers' => ['present', 'array'],
            'answers.*.question_id' => ['required', 'string'],
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

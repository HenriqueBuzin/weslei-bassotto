<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\ApiException;
use App\Models\ConsultancyQuestion;
use App\Models\ConsultancySubmission;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class ConsultancyService
{
    /**
     * @return Collection<int, ConsultancyQuestion>
     */
    /**
     * Any edit to the questionnaire flags the running contracts, so the
     * subscriber area can ask them to review instead of letting a new or
     * reworded question surface as an unexplained validation error on save.
     */
    public function markQuestionnaireChanged(): void
    {
        $now = Carbon::now();

        ConsultancySubmission::query()
            ->where('status', 'active')
            ->update(['questionnaire_changed_at' => $now, 'updated_at' => $now]);
    }

    /**
     * @return Collection<int, ConsultancyQuestion>
     */
    public function activeQuestions(): Collection
    {
        return ConsultancyQuestion::query()->where('active', true)->ordered()->limit(200)->get();
    }

    /**
     * Freezes the submitted answers together with the question label and type,
     * so a later question edit never rewrites history.
     *
     * @param  list<array{question_id: string, value: mixed}>  $answers
     * @return list<array{question_id: string, label: string, type: string, value: mixed}>
     *
     * @throws ApiException When a required question was left blank.
     */
    public function buildAnswerSnapshot(array $answers): array
    {
        $questions = $this->activeQuestions()->keyBy('id');

        $values = [];
        foreach ($answers as $answer) {
            $values[$answer['question_id']] = $answer['value'] ?? null;
        }

        $missing = $questions
            ->filter(fn (ConsultancyQuestion $question): bool => $question->required
                && in_array($values[$question->id] ?? null, [null, ''], true))
            ->map(fn (ConsultancyQuestion $question): string => $question->label)
            ->values()
            ->all();

        if ($missing !== []) {
            throw ApiException::unprocessable(
                'required_questions_missing',
                'Some required questions were left blank',
                ['missing_questions' => $missing],
            );
        }

        $snapshot = [];
        foreach ($values as $questionId => $value) {
            $question = $questions->get($questionId);

            if ($question !== null) {
                $snapshot[] = [
                    'question_id' => $questionId,
                    'label' => $question->label,
                    'type' => $question->type,
                    'value' => $value,
                ];
            }
        }

        return $snapshot;
    }
}

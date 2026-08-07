<?php

declare(strict_types=1);

namespace Tests\Functional;

use Tests\TestCase;

/**
 * Editing the questionnaire was silent for people who already had a contract: a
 * new or reworded question only surfaced as an unexplained validation error the
 * next time they saved. Every edit now flags the running contracts.
 */
final class QuestionnaireChangeTest extends TestCase
{
    public function test_a_new_question_flags_the_running_contracts(): void
    {
        $submission = $this->createSubmission(['customer_email' => 'aluno@example.com']);

        $this->assertNull($submission->questionnaire_changed_at);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/questions'), ['label' => 'Tem alguma lesão?'])
            ->assertCreated();

        $this->assertNotNull($submission->refresh()->questionnaire_changed_at);
    }

    public function test_editing_a_question_flags_the_running_contracts(): void
    {
        $question = $this->createQuestion(['label' => 'Objetivo']);
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), ['label' => 'Qual seu objetivo?'])
            ->assertOk();

        $this->assertNotNull($submission->refresh()->questionnaire_changed_at);
    }

    public function test_deleting_a_question_flags_the_running_contracts(): void
    {
        $question = $this->createQuestion();
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->deleteJson($this->apiUrl("consultancy/admin/questions/{$question->id}"))
            ->assertNoContent();

        $this->assertNotNull($submission->refresh()->questionnaire_changed_at);
    }

    /** A no-op patch changes nothing, so it must not nag the whole base. */
    public function test_an_empty_patch_leaves_the_contracts_alone(): void
    {
        $question = $this->createQuestion();
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), [])
            ->assertOk();

        $this->assertNull($submission->refresh()->questionnaire_changed_at);
    }

    public function test_a_finished_contract_is_not_asked_to_review(): void
    {
        $submission = $this->createSubmission(['status' => 'finished']);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/questions'), ['label' => 'Pergunta nova'])
            ->assertCreated();

        $this->assertNull($submission->refresh()->questionnaire_changed_at);
    }

    public function test_the_flag_reaches_the_subscriber_and_clears_once_they_review(): void
    {
        $user = $this->createUser();
        $question = $this->createQuestion(['label' => 'Objetivo']);
        $submission = $this->createSubmission(['customer_email' => $user->email]);
        $headers = $this->authHeader($user);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), ['label' => 'Qual seu objetivo?'])
            ->assertOk();

        $this->withHeaders($headers)
            ->getJson($this->apiUrl('consultancy/me/submissions'))
            ->assertOk()
            ->assertJsonPath('0.questionnaire_changed_at', fn ($value): bool => $value !== null);

        $this->withHeaders($headers)
            ->patchJson($this->apiUrl("consultancy/me/submissions/{$submission->id}/answers"), [
                'answers' => [['question_id' => $question->id, 'value' => 'Hipertrofia']],
            ])
            ->assertOk()
            ->assertJsonPath('questionnaire_changed_at', null);

        $this->assertNull($submission->refresh()->questionnaire_changed_at);
    }
}

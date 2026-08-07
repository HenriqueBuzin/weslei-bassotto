<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Domain\PlanCatalog;
use App\Models\AdminEvent;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use Illuminate\Support\Carbon;
use Tests\TestCase;

final class ConsultancyEndpointsTest extends TestCase
{
    public function test_public_questions_list_only_active_ones_in_order(): void
    {
        $this->createQuestion(['label' => 'Segunda pergunta', 'position' => 2]);
        $this->createQuestion(['label' => 'Primeira pergunta', 'position' => 1]);
        $this->createQuestion(['label' => 'Pergunta desativada', 'active' => false, 'position' => 0]);

        $response = $this->getJson($this->apiUrl('consultancy/questions'))->assertOk();

        $this->assertSame(['Primeira pergunta', 'Segunda pergunta'], array_column($response->json(), 'label'));
    }

    public function test_a_question_exposes_the_full_contract(): void
    {
        $question = $this->createQuestion(['type' => 'select', 'options' => ['A', 'B'], 'position' => 3]);

        $this->getJson($this->apiUrl('consultancy/questions'))
            ->assertOk()
            ->assertJsonPath('0.id', $question->id)
            ->assertJsonPath('0.type', 'select')
            ->assertJsonPath('0.options', ['A', 'B'])
            ->assertJsonPath('0.required', true)
            ->assertJsonPath('0.active', true)
            ->assertJsonPath('0.order', 3);
    }

    public function test_creating_a_submission_activates_the_contract_and_claims_the_payment(): void
    {
        // Freezing at the real clock: firebase/php-jwt validates `exp` against
        // time(), so a fabricated past date would expire the access token.
        Carbon::setTestNow(Carbon::now());
        $today = Carbon::now();

        $user = $this->createUser('aluno@example.com');
        $question = $this->createQuestion();
        [$payment, $claimToken] = $this->createApprovedPayment();

        $response = $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken, [
                ['question_id' => $question->id, 'value' => 'Ganhar massa'],
            ]));

        $response->assertCreated()
            ->assertJsonPath('status', 'active')
            ->assertJsonPath('customer.email', 'aluno@example.com')
            ->assertJsonPath('plan.slug', 'trimestral')
            ->assertJsonPath('plan.months', 3)
            ->assertJsonPath('plan.start_date', $today->toDateString())
            ->assertJsonPath('plan.end_date', PlanCatalog::addMonths($today, 3)->toDateString())
            ->assertJsonPath('renewal_count', 0)
            ->assertJsonPath('answers.0.label', 'Qual seu objetivo?')
            ->assertJsonPath('answers.0.value', 'Ganhar massa')
            ->assertJsonPath('recurrence_status', 'approved');

        $this->assertSame($response->json('id'), $payment->refresh()->claimed_submission_id);
        $this->assertSame(1, AdminEvent::query()->where('type', 'new_contract')->count());

        Carbon::setTestNow();
    }

    public function test_a_submission_requires_an_approved_payment(): void
    {
        $user = $this->createUser();
        [$payment, $claimToken] = $this->createApprovedPayment(['status' => 'pending']);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(402)
            ->assertJsonPath('code', 'approved_payment_required');
    }

    public function test_a_submission_requires_the_matching_claim_token(): void
    {
        $user = $this->createUser();
        [$payment] = $this->createApprovedPayment();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, 'token-errado'))
            ->assertStatus(402);
    }

    public function test_a_payment_for_another_plan_is_rejected(): void
    {
        $user = $this->createUser();
        [$payment, $claimToken] = $this->createApprovedPayment(['plan_slug' => 'anual']);

        $payload = $this->submissionPayload($payment, $claimToken);
        $payload['plan_slug'] = 'trimestral';

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $payload)
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment_plan_mismatch');
    }

    public function test_a_renewal_payment_cannot_open_a_new_contract(): void
    {
        $user = $this->createUser();
        $submission = $this->createSubmission();
        [$payment, $claimToken] = $this->createApprovedPayment(['renewal_submission_id' => $submission->id]);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment_plan_mismatch');
    }

    public function test_a_payment_belonging_to_another_account_is_rejected(): void
    {
        $user = $this->createUser('aluno@example.com');
        [$payment, $claimToken] = $this->createApprovedPayment(['account_email' => 'outro@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(403)
            ->assertJsonPath('code', 'payment_owned_by_another_account');
    }

    public function test_an_already_claimed_payment_is_rejected(): void
    {
        $user = $this->createUser();
        $other = $this->createSubmission();
        [$payment, $claimToken] = $this->createApprovedPayment(['claimed_submission_id' => $other->id]);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment_already_used');
    }

    public function test_the_student_email_must_match_the_account(): void
    {
        $user = $this->createUser('aluno@example.com');
        [$payment, $claimToken] = $this->createApprovedPayment();

        $payload = $this->submissionPayload($payment, $claimToken);
        $payload['customer']['email'] = 'outro@example.com';

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $payload)
            ->assertStatus(409)
            ->assertJsonPath('code', 'customer_email_mismatch');
    }

    public function test_required_questions_left_blank_are_reported(): void
    {
        $user = $this->createUser();
        $this->createQuestion(['label' => 'Objetivo']);
        $this->createQuestion(['label' => 'Lesões']);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(422)
            ->assertJsonPath('missing_questions', ['Objetivo', 'Lesões']);
    }

    public function test_an_empty_string_does_not_satisfy_a_required_question(): void
    {
        $user = $this->createUser();
        $question = $this->createQuestion(['label' => 'Objetivo']);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken, [
                ['question_id' => $question->id, 'value' => ''],
            ]))
            ->assertStatus(422)
            ->assertJsonPath('missing_questions', ['Objetivo']);
    }

    public function test_optional_questions_may_be_skipped(): void
    {
        $user = $this->createUser();
        $this->createQuestion(['label' => 'Observações', 'required' => false]);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertCreated()
            ->assertJsonPath('answers', []);
    }

    public function test_answers_for_unknown_questions_are_discarded(): void
    {
        $user = $this->createUser();
        $question = $this->createQuestion(['required' => false]);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken, [
                ['question_id' => $question->id, 'value' => 'mantida'],
                ['question_id' => str_repeat('a', 24), 'value' => 'descartada'],
            ]))
            ->assertCreated()
            ->assertJsonCount(1, 'answers')
            ->assertJsonPath('answers.0.value', 'mantida');
    }

    public function test_creating_a_submission_requires_authentication(): void
    {
        [$payment, $claimToken] = $this->createApprovedPayment();

        $this->postJson($this->apiUrl('consultancy/submissions'), $this->submissionPayload($payment, $claimToken))
            ->assertStatus(401);
    }

    public function test_creating_a_submission_validates_the_payload(): void
    {
        $user = $this->createUser();

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), ['plan_slug' => 'mensal'])
            ->assertStatus(422);
    }

    public function test_a_subscriber_only_sees_their_own_contracts(): void
    {
        $user = $this->createUser('aluno@example.com');
        $this->createSubmission(['customer_email' => 'aluno@example.com']);
        $this->createSubmission(['customer_email' => 'outro@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->getJson($this->apiUrl('consultancy/me/submissions'))
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.customer.email', 'aluno@example.com');
    }

    public function test_updating_answers_stores_a_revision_and_alerts_the_admin(): void
    {
        $user = $this->createUser('aluno@example.com');
        $question = $this->createQuestion();
        $submission = $this->createSubmission([
            'customer_email' => 'aluno@example.com',
            'answers' => [[
                'question_id' => $question->id,
                'label' => 'Qual seu objetivo?',
                'type' => 'textarea',
                'value' => 'Resposta antiga',
            ]],
            'answers_seen_at' => Carbon::now(),
        ]);

        $this->withHeaders($this->authHeader($user))
            ->patchJson($this->apiUrl("consultancy/me/submissions/{$submission->id}/answers"), [
                'answers' => [['question_id' => $question->id, 'value' => 'Resposta nova']],
            ])
            ->assertOk()
            ->assertJsonPath('answers.0.value', 'Resposta nova')
            ->assertJsonPath('answers_seen_at', null)
            ->assertJsonCount(1, 'answer_revisions')
            ->assertJsonPath('answer_revisions.0.answers.0.value', 'Resposta antiga')
            ->assertJsonPath('answer_revisions.0.changed_by', 'subscriber');

        $this->assertSame(1, AdminEvent::query()->where('type', 'answers_changed')->count());
    }

    public function test_updating_answers_of_another_subscriber_is_forbidden(): void
    {
        $user = $this->createUser('aluno@example.com');
        $submission = $this->createSubmission(['customer_email' => 'outro@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->patchJson($this->apiUrl("consultancy/me/submissions/{$submission->id}/answers"), ['answers' => []])
            ->assertStatus(403)
            ->assertJsonPath('code', 'submission_not_owned');
    }

    public function test_updating_answers_of_a_missing_contract_returns_not_found(): void
    {
        $user = $this->createUser();

        $this->withHeaders($this->authHeader($user))
            ->patchJson($this->apiUrl('consultancy/me/submissions/'.str_repeat('b', 24).'/answers'), ['answers' => []])
            ->assertStatus(404)
            ->assertJsonPath('code', 'submission_not_found');
    }

    public function test_updating_answers_with_a_malformed_id_is_rejected(): void
    {
        $user = $this->createUser();

        $this->withHeaders($this->authHeader($user))
            ->patchJson($this->apiUrl('consultancy/me/submissions/nao-e-id/answers'), ['answers' => []])
            ->assertStatus(400)
            ->assertJsonPath('code', 'invalid_id');
    }

    public function test_a_contract_owner_is_matched_case_insensitively(): void
    {
        $user = $this->createUser('Aluno@Example.com');
        $submission = $this->createSubmission(['customer_email' => 'aluno@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->patchJson($this->apiUrl("consultancy/me/submissions/{$submission->id}/answers"), ['answers' => []])
            ->assertOk();

        $this->assertNotNull(ConsultancySubmission::query()->find($submission->id)->answers_changed_at);
    }

    /**
     * @param  list<array{question_id: string, value: mixed}>  $answers
     * @return array<string, mixed>
     */
    private function submissionPayload(Payment $payment, string $claimToken, array $answers = []): array
    {
        return [
            'plan_slug' => $payment->plan_slug,
            'customer' => [
                'name' => 'Aluno Teste',
                'email' => 'aluno@example.com',
                'phone' => '5554999999999',
            ],
            'answers' => $answers,
            'payment_id' => $payment->id,
            'payment_token' => $claimToken,
        ];
    }
}

<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Models\AdminEvent;
use App\Models\ConsultancyQuestion;
use Illuminate\Support\Carbon;
use Tests\TestCase;

final class ConsultancyAdminEndpointsTest extends TestCase
{
    public function test_admin_endpoints_reject_a_plain_subscriber(): void
    {
        $user = $this->createUser();

        $this->withHeaders($this->authHeader($user))
            ->getJson($this->apiUrl('consultancy/admin/questions'))
            ->assertStatus(403)
            ->assertJsonPath('code', 'forbidden_role');
    }

    public function test_admin_endpoints_reject_anonymous_access(): void
    {
        $this->getJson($this->apiUrl('consultancy/admin/questions'))->assertStatus(401);
    }

    public function test_the_admin_secret_is_available_to_admins(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->getJson($this->apiUrl('admin/secret'))
            ->assertOk()
            ->assertExactJson(['ok' => true, 'msg' => 'admin only content']);
    }

    public function test_admins_list_inactive_questions_too(): void
    {
        $this->createQuestion(['label' => 'Ativa', 'position' => 1]);
        $this->createQuestion(['label' => 'Inativa', 'active' => false, 'position' => 2]);

        $response = $this->withHeaders($this->authHeader($this->createAdmin()))
            ->getJson($this->apiUrl('consultancy/admin/questions'))
            ->assertOk();

        $this->assertSame(['Ativa', 'Inativa'], array_column($response->json(), 'label'));
    }

    public function test_creating_a_question_applies_the_documented_defaults(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/questions'), ['label' => 'Quantas refeições por dia?'])
            ->assertCreated()
            ->assertJsonPath('type', 'textarea')
            ->assertJsonPath('options', [])
            ->assertJsonPath('required', true)
            ->assertJsonPath('active', true)
            ->assertJsonPath('order', 0);
    }

    public function test_creating_a_question_accepts_every_field(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/questions'), [
                'label' => 'Qual seu nível?',
                'type' => 'select',
                'options' => ['Iniciante', 'Avançado'],
                'required' => false,
                'active' => false,
                'order' => 7,
            ])
            ->assertCreated()
            ->assertJsonPath('type', 'select')
            ->assertJsonPath('options', ['Iniciante', 'Avançado'])
            ->assertJsonPath('required', false)
            ->assertJsonPath('active', false)
            ->assertJsonPath('order', 7);
    }

    public function test_creating_a_question_validates_the_label_and_type(): void
    {
        $headers = $this->authHeader($this->createAdmin());

        $this->withHeaders($headers)
            ->postJson($this->apiUrl('consultancy/admin/questions'), ['label' => 'ab'])
            ->assertStatus(422);

        $this->withHeaders($headers)
            ->postJson($this->apiUrl('consultancy/admin/questions'), ['label' => 'Pergunta', 'type' => 'radio'])
            ->assertStatus(422);
    }

    public function test_patching_a_question_only_touches_the_sent_fields(): void
    {
        $question = $this->createQuestion(['label' => 'Original', 'position' => 4, 'required' => true]);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), ['label' => 'Atualizada'])
            ->assertOk()
            ->assertJsonPath('label', 'Atualizada')
            ->assertJsonPath('order', 4)
            ->assertJsonPath('required', true);
    }

    public function test_patching_a_question_can_reorder_and_deactivate_it(): void
    {
        $question = $this->createQuestion();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), [
                'order' => 9,
                'active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('order', 9)
            ->assertJsonPath('active', false);
    }

    public function test_patching_a_question_with_an_empty_body_is_a_no_op(): void
    {
        $question = $this->createQuestion(['label' => 'Intacta']);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/questions/{$question->id}"), [])
            ->assertOk()
            ->assertJsonPath('label', 'Intacta');
    }

    public function test_patching_a_missing_question_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl('consultancy/admin/questions/'.str_repeat('c', 24)), ['label' => 'Nova'])
            ->assertStatus(404)
            ->assertJsonPath('code', 'question_not_found');
    }

    public function test_patching_a_question_with_a_malformed_id_is_rejected(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl('consultancy/admin/questions/xyz'), ['label' => 'Nova'])
            ->assertStatus(400)
            ->assertJsonPath('code', 'invalid_id');
    }

    public function test_deleting_a_question_removes_it(): void
    {
        $question = $this->createQuestion();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->deleteJson($this->apiUrl("consultancy/admin/questions/{$question->id}"))
            ->assertNoContent();

        $this->assertSame(0, ConsultancyQuestion::query()->count());
    }

    public function test_deleting_a_missing_question_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->deleteJson($this->apiUrl('consultancy/admin/questions/'.str_repeat('d', 24)))
            ->assertStatus(404);
    }

    public function test_admins_see_every_contract_newest_first(): void
    {
        $older = $this->createSubmission(['customer_email' => 'a@example.com']);
        $older->forceFill(['created_at' => Carbon::now()->subDay()])->save();
        $newer = $this->createSubmission(['customer_email' => 'b@example.com']);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->getJson($this->apiUrl('consultancy/admin/submissions'))
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.id', $newer->id)
            ->assertJsonPath('1.id', $older->id);
    }

    public function test_admins_can_patch_the_contract_status_and_dates(): void
    {
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/submissions/{$submission->id}"), [
                'status' => 'finished',
                'start_date' => '2026-02-01',
                'end_date' => '2026-05-01',
                'payment_reference' => 'mp-manual',
            ])
            ->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('plan.start_date', '2026-02-01')
            ->assertJsonPath('plan.end_date', '2026-05-01')
            ->assertJsonPath('payment_reference', 'mp-manual');
    }

    public function test_patching_a_contract_can_clear_the_dates(): void
    {
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/submissions/{$submission->id}"), [
                'start_date' => null,
                'end_date' => null,
            ])
            ->assertOk()
            ->assertJsonPath('plan.start_date', null)
            ->assertJsonPath('plan.end_date', null);
    }

    public function test_patching_a_contract_with_an_empty_body_is_a_no_op(): void
    {
        $submission = $this->createSubmission(['status' => 'active']);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/submissions/{$submission->id}"), [])
            ->assertOk()
            ->assertJsonPath('status', 'active');
    }

    public function test_patching_a_contract_rejects_an_unknown_status(): void
    {
        $submission = $this->createSubmission();

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl("consultancy/admin/submissions/{$submission->id}"), ['status' => 'pausado'])
            ->assertStatus(422);
    }

    public function test_patching_a_missing_contract_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->patchJson($this->apiUrl('consultancy/admin/submissions/'.str_repeat('e', 24)), ['status' => 'active'])
            ->assertStatus(404)
            ->assertJsonPath('code', 'submission_not_found');
    }

    public function test_marking_answers_as_seen_also_clears_the_related_alerts(): void
    {
        $submission = $this->createSubmission();
        AdminEvent::query()->create([
            'type' => 'answers_changed',
            'submission_id' => $submission->id,
            'seen_at' => null,
            'created_at' => Carbon::now(),
        ]);
        AdminEvent::query()->create([
            'type' => 'new_contract',
            'submission_id' => $submission->id,
            'seen_at' => null,
            'created_at' => Carbon::now(),
        ]);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl("consultancy/admin/submissions/{$submission->id}/answers/seen"))
            ->assertOk();

        $this->assertNotNull(
            AdminEvent::query()->where('type', 'answers_changed')->first()->seen_at
        );
        $this->assertNull(
            AdminEvent::query()->where('type', 'new_contract')->first()->seen_at
        );
    }

    public function test_marking_answers_seen_on_a_missing_contract_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/submissions/'.str_repeat('f', 24).'/answers/seen'))
            ->assertStatus(404);
    }

    public function test_alerts_are_listed_newest_first_with_string_ids(): void
    {
        $submission = $this->createSubmission();
        AdminEvent::query()->create([
            'type' => 'new_contract',
            'submission_id' => $submission->id,
            'seen_at' => null,
            'created_at' => Carbon::now()->subHour(),
        ]);
        AdminEvent::query()->create([
            'type' => 'payment_failed',
            'seen_at' => null,
            'created_at' => Carbon::now(),
        ]);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->getJson($this->apiUrl('consultancy/admin/events'))
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.type', 'payment_failed')
            ->assertJsonPath('0.submission_id', '')
            ->assertJsonPath('0.payment_id', '')
            ->assertJsonPath('1.type', 'new_contract')
            ->assertJsonPath('1.submission_id', $submission->id);
    }

    public function test_an_alert_can_be_marked_as_seen(): void
    {
        $event = AdminEvent::query()->create([
            'type' => 'payment_failed',
            'seen_at' => null,
            'created_at' => Carbon::now(),
        ]);

        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl("consultancy/admin/events/{$event->id}/seen"))
            ->assertOk()
            ->assertExactJson(['ok' => true]);

        $this->assertNotNull($event->refresh()->seen_at);
    }

    public function test_marking_a_missing_alert_as_seen_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createAdmin()))
            ->postJson($this->apiUrl('consultancy/admin/events/'.str_repeat('a', 24).'/seen'))
            ->assertStatus(404)
            ->assertJsonPath('code', 'admin_event_not_found');
    }
}

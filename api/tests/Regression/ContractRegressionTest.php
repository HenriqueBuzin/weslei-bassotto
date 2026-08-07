<?php

declare(strict_types=1);

namespace Tests\Regression;

use App\Models\ConsultancyQuestion;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use App\Payments\PaymentStatus;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class ContractRegressionTest extends TestCase
{
    public function test_collections_are_returned_as_bare_arrays_without_a_data_envelope(): void
    {
        $this->createQuestion();

        foreach (['plans', 'consultancy/questions'] as $path) {
            $payload = $this->getJson($this->apiUrl($path))->assertOk()->json();

            $this->assertArrayNotHasKey('data', $payload);
            $this->assertArrayHasKey(0, $payload);
        }
    }

    public function test_errors_always_use_the_detail_envelope(): void
    {
        $this->getJson($this->apiUrl('me'))->assertStatus(401)->assertJsonStructure(['detail']);
        $this->getJson($this->apiUrl('payments/'.str_repeat('a', 24).'/status?token=x'))
            ->assertStatus(404)
            ->assertJsonStructure(['detail']);
        $this->postJson($this->apiUrl('auth/register'), [])->assertStatus(422)->assertJsonStructure(['detail']);
    }

    public function test_a_persistent_refresh_cookie_carries_an_integer_expiry(): void
    {
        $this->createUser();

        $cookie = $this->post($this->apiUrl('auth/login'), [
            'username' => 'aluno@example.com',
            'password' => 'segredo123',
            'remember' => 'true',
        ])->assertOk()->getCookie('rt', false);

        // Carbon 3 returns a float from diffInSeconds and the Symfony cookie wants an
        // int, which used to 500 here. assertOk above catches that; the window below
        // proves the expiry itself is still the long "remember me" one.
        $expires = $cookie->getExpiresTime();

        $this->assertGreaterThan(Carbon::now()->addDays(29)->getTimestamp(), $expires);
        $this->assertLessThan(Carbon::now()->addDays(31)->getTimestamp(), $expires);
    }

    public function test_the_webhook_reads_the_dotted_data_id_query_parameter(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-dot', 'status' => 'approved'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-dot',
        ]);

        // PHP rewrites dots in parameter names to underscores, so the signature
        // check must read the raw query string to find `data.id`.
        $timestamp = '1700000000';
        $manifest = "id:mp-dot;request-id:req-1;ts:{$timestamp};";
        $signature = "ts={$timestamp},v1=".hash_hmac('sha256', $manifest, 'test-webhook-secret');

        $this->withHeaders(['x-signature' => $signature, 'x-request-id' => 'req-1'])
            ->postJson($this->apiUrl('payments/webhooks/mercado_pago').'?data.id=mp-dot', [
                'topic' => 'payment',
                'id' => 'mp-dot',
            ])
            ->assertOk()
            ->assertJsonPath('processed', true);

        $this->assertSame('approved', Payment::query()->firstOrFail()->status);
    }

    public function test_an_answer_snapshot_survives_a_later_question_rename(): void
    {
        $user = $this->createUser('aluno@example.com');
        $question = $this->createQuestion(['label' => 'Rótulo original']);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $response = $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), [
                'plan_slug' => 'trimestral',
                'customer' => ['name' => 'Aluno', 'email' => 'aluno@example.com', 'phone' => '5554999999999'],
                'answers' => [['question_id' => $question->id, 'value' => 'resposta']],
                'payment_id' => $payment->id,
                'payment_token' => $claimToken,
            ])
            ->assertCreated();

        ConsultancyQuestion::query()->whereKey($question->id)->update(['label' => 'Rótulo novo']);

        $this->withHeaders($this->authHeader($user))
            ->getJson($this->apiUrl('consultancy/me/submissions'))
            ->assertOk()
            ->assertJsonPath('0.id', $response->json('id'))
            ->assertJsonPath('0.answers.0.label', 'Rótulo original');
    }

    public function test_login_accepts_any_email_casing_and_surrounding_spaces(): void
    {
        $this->createUser('aluno@example.com');

        $this->post($this->apiUrl('auth/login'), [
            'username' => '  ALUNO@Example.COM  ',
            'password' => 'segredo123',
        ])->assertOk();
    }

    public function test_cors_allows_the_configured_origin_with_credentials(): void
    {
        $this->call('OPTIONS', $this->apiUrl('plans'), server: [
            'HTTP_ORIGIN' => 'http://localhost:5173',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ])
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
            ->assertHeader('Access-Control-Allow-Credentials', 'true');
    }

    public function test_cors_never_echoes_an_unlisted_origin_back(): void
    {
        $response = $this->call('OPTIONS', $this->apiUrl('plans'), server: [
            'HTTP_ORIGIN' => 'https://atacante.com',
            'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET',
        ]);

        // The allowlist is echoed verbatim, so the browser rejects the mismatch.
        $this->assertNotSame('https://atacante.com', $response->headers->get('Access-Control-Allow-Origin'));
    }

    public function test_the_claim_token_is_never_serialized_back_to_the_client(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-hide', 'status' => 'approved'], 201),
        ]);

        $response = $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), [
                'plan_slug' => 'trimestral',
                'payer_email' => 'aluno@example.com',
                'card_token_id' => 'card-token',
            ])
            ->assertOk();

        $this->assertArrayNotHasKey('claim_token_hash', $response->json());
        $this->assertStringNotContainsString(
            Payment::query()->firstOrFail()->claim_token_hash,
            (string) $response->getContent(),
        );
    }

    public function test_the_password_hash_is_never_serialized_back_to_the_client(): void
    {
        $user = $this->createUser();

        $response = $this->withHeaders($this->authHeader($user))->getJson($this->apiUrl('me'))->assertOk();

        $this->assertArrayNotHasKey('password_hash', $response->json());
    }

    public function test_a_second_subscriber_cannot_reuse_a_claimed_payment(): void
    {
        $first = $this->createUser('aluno@example.com');
        $question = $this->createQuestion(['required' => false]);
        [$payment, $claimToken] = $this->createApprovedPayment();

        $payload = [
            'plan_slug' => 'trimestral',
            'customer' => ['name' => 'Aluno', 'email' => 'aluno@example.com', 'phone' => '5554999999999'],
            'answers' => [['question_id' => $question->id, 'value' => 'ok']],
            'payment_id' => $payment->id,
            'payment_token' => $claimToken,
        ];

        $this->withHeaders($this->authHeader($first))
            ->postJson($this->apiUrl('consultancy/submissions'), $payload)
            ->assertCreated();

        $this->withHeaders($this->authHeader($first))
            ->postJson($this->apiUrl('consultancy/submissions'), $payload)
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment_already_used');

        $this->assertSame(1, ConsultancySubmission::query()->count());
    }
}

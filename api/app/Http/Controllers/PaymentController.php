<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\Payments\CardSubscriptionRequest;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use App\Models\User;
use App\Payments\GatewayException;
use App\Payments\MercadoPagoGateway;
use App\Services\PaymentService;
use App\Support\RecordId;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use InvalidArgumentException;

class PaymentController extends Controller
{
    public function __construct(private readonly PaymentService $payments) {}

    public function cardSubscription(CardSubscriptionRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return $this->charge($request, $user, null);
    }

    public function renewal(string $submissionId, CardSubscriptionRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $id = RecordId::normalize($submissionId);

        if ($id === null) {
            throw ApiException::badRequest('invalid_id', 'The provided identifier is malformed');
        }

        $submission = ConsultancySubmission::query()->find($id);

        if ($submission === null) {
            throw ApiException::notFound('submission_not_found', 'Contract not found');
        }

        if (! $submission->isOwnedBy($user->email)) {
            throw ApiException::forbidden('submission_not_owned', 'You cannot renew this contract');
        }

        return $this->charge($request, $user, $submission->id);
    }

    public function status(string $paymentId, Request $request): JsonResponse
    {
        $payment = $this->payments->findByClaim($paymentId, (string) $request->query('token', ''));

        if ($payment === null) {
            throw ApiException::notFound('payment_not_found', 'Payment not found');
        }

        return new JsonResponse([
            'id' => $payment->id,
            'status' => $payment->status,
            'status_detail' => $payment->status_detail,
        ]);
    }

    public function webhook(string $gateway, Request $request): JsonResponse
    {
        $payload = (array) $request->json()->all();

        if ($gateway === 'mercado_pago') {
            $this->assertMercadoPagoSignature($request, $payload);
        }

        try {
            $processed = $this->payments->applyWebhook($gateway, $payload);
        } catch (GatewayException|InvalidArgumentException $exception) {
            throw ApiException::badRequest('payment_webhook_rejected', $exception->getMessage());
        }

        return new JsonResponse(['ok' => true, 'processed' => $processed]);
    }

    private function charge(CardSubscriptionRequest $request, User $user, ?string $renewalSubmissionId): JsonResponse
    {
        try {
            [$payment, $claimToken] = $this->payments->create(
                planSlug: $request->string('plan_slug')->value(),
                mode: $request->mode(),
                payerEmail: $request->string('payer_email')->value(),
                cardToken: $request->string('card_token_id')->value(),
                paymentMethodId: $request->input('payment_method_id'),
                accountEmail: $user->email,
                renewalSubmissionId: $renewalSubmissionId,
                preferredGateway: $request->input('gateway'),
            );
        } catch (GatewayException $exception) {
            throw ApiException::badGateway('payment_gateway_error', $exception->getMessage());
        }

        return new JsonResponse($this->paymentPayload($payment, $claimToken));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function assertMercadoPagoSignature(Request $request, array $payload): void
    {
        $dataId = $this->mercadoPagoDataId($request) ?? (string) (data_get($payload, 'data.id') ?? '');

        $valid = MercadoPagoGateway::verifyWebhookSignature(
            signature: (string) $request->header('x-signature', ''),
            requestId: (string) $request->header('x-request-id', ''),
            dataId: $dataId,
            secret: (string) Config::get('platform.payments.mercado_pago.webhook_secret'),
        );

        if (! $valid) {
            throw ApiException::unauthorized('webhook_signature_invalid', 'The webhook signature is invalid');
        }
    }

    /**
     * Mercado Pago sends `?data.id=`, but PHP rewrites dots in parameter names
     * to underscores, so the raw query string is parsed by hand.
     */
    private function mercadoPagoDataId(Request $request): ?string
    {
        foreach (explode('&', $request->getQueryString() ?? '') as $pair) {
            [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');

            if (urldecode($key) === 'data.id' && $value !== '') {
                return urldecode($value);
            }
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function paymentPayload(Payment $payment, string $claimToken): array
    {
        return [
            'payment_id' => $payment->id,
            'payment_token' => $claimToken,
            'gateway' => (string) $payment->gateway,
            'external_id' => $payment->external_id,
            'status' => $payment->status,
        ];
    }
}

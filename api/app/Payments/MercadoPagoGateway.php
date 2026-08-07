<?php

declare(strict_types=1);

namespace App\Payments;

use App\Domain\PlanCatalog;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;

final class MercadoPagoGateway implements PaymentGateway
{
    private const BASE_URL = 'https://api.mercadopago.com';

    private readonly string $publicUrl;

    public function __construct(
        private readonly string $accessToken,
        string $publicUrl,
    ) {
        $this->publicUrl = rtrim($publicUrl, '/');
    }

    public function name(): string
    {
        return 'mercado_pago';
    }

    public function createCharge(ChargeRequest $request): ChargeResult
    {
        $response = $request->mode === 'cash'
            ? $this->createCashCharge($request)
            : $this->createSubscription($request);

        if ($response->status() >= 400) {
            throw new GatewayRejected(
                "Mercado Pago rejected the operation ({$response->status()}): {$response->body()}"
            );
        }

        $data = (array) $response->json();

        return new ChargeResult(
            gateway: $this->name(),
            externalId: (string) ($data['id'] ?? ''),
            status: PaymentStatus::fromGateway($data['status'] ?? null),
            statusDetail: isset($data['status_detail']) ? (string) $data['status_detail'] : null,
        );
    }

    public function parseWebhook(array $payload): ?WebhookEvent
    {
        $eventType = (string) ($payload['type'] ?? $payload['topic'] ?? '');
        $externalId = $payload['data']['id'] ?? $payload['id'] ?? null;

        if ($externalId === null || ! $this->isPaymentEvent($eventType)) {
            return null;
        }

        $response = $this->request('get', $this->webhookEndpoint($eventType).'/'.$externalId);

        if ($response->status() >= 400) {
            throw new GatewayException("Could not read the payment ({$response->status()})");
        }

        $data = (array) $response->json();
        $status = $data['status'] ?? null;

        // Authorized payments belong to a preapproval: the parent is what we track.
        $matchedId = str_contains($eventType, 'authorized_payment')
            ? ($data['preapproval_id'] ?? $externalId)
            : $externalId;

        return new WebhookEvent(
            eventId: (string) ($payload['id'] ?? "{$eventType}:{$externalId}:{$status}"),
            externalId: (string) ($matchedId ?: $externalId),
            status: PaymentStatus::fromGateway($status),
            statusDetail: isset($data['status_detail']) ? (string) $data['status_detail'] : null,
        );
    }

    public static function verifyWebhookSignature(
        string $signature,
        string $requestId,
        string $dataId,
        string $secret,
    ): bool {
        $parts = [];

        foreach (explode(',', $signature) as $item) {
            if (str_contains($item, '=')) {
                [$key, $value] = explode('=', $item, 2);
                $parts[trim($key)] = trim($value);
            }
        }

        $timestamp = $parts['ts'] ?? '';
        $received = $parts['v1'] ?? '';

        if ($timestamp === '' || $received === '' || $requestId === '' || $dataId === '' || $secret === '') {
            return false;
        }

        $manifest = 'id:'.strtolower($dataId).';request-id:'.$requestId.';ts:'.$timestamp.';';

        return hash_equals(hash_hmac('sha256', $manifest, $secret), $received);
    }

    private function createCashCharge(ChargeRequest $request): Response
    {
        $payload = [
            'transaction_amount' => (float) $request->amount,
            'token' => $request->cardToken,
            'description' => $request->description,
            'installments' => 1,
            'payer' => ['email' => $request->payerEmail],
            'external_reference' => $request->reference,
        ];

        if ($request->paymentMethodId !== null) {
            $payload['payment_method_id'] = $request->paymentMethodId;
        }

        return $this->request('post', '/v1/payments', $payload, [
            'X-Idempotency-Key' => $request->reference,
        ]);
    }

    private function createSubscription(ChargeRequest $request): Response
    {
        $now = Carbon::now();

        $payload = [
            'reason' => $request->description,
            'external_reference' => $request->reference,
            'payer_email' => $request->payerEmail,
            'card_token_id' => $request->cardToken,
            'auto_recurring' => [
                'frequency' => 1,
                'frequency_type' => 'months',
                'start_date' => $now->copy()->micro(0)->toIso8601String(),
                'end_date' => PlanCatalog::addMonths($now, $request->installments)->endOfDay()->micro(0)->toIso8601String(),
                'transaction_amount' => (float) $request->amount,
                'currency_id' => 'BRL',
            ],
            'back_url' => $this->publicUrl.'/pagamento/retorno',
            'status' => 'authorized',
        ];

        if ($request->paymentMethodId !== null) {
            $payload['payment_method_id'] = $request->paymentMethodId;
        }

        return $this->request('post', '/preapproval', $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, string>  $headers
     */
    private function request(string $method, string $path, array $payload = [], array $headers = []): Response
    {
        if ($this->accessToken === '') {
            throw new GatewayUnavailable('MERCADO_PAGO_ACCESS_TOKEN is not configured');
        }

        try {
            return Http::withToken($this->accessToken)
                ->withHeaders($headers)
                ->timeout(20)
                ->asJson()
                ->acceptJson()
                ->{$method}(self::BASE_URL.$path, $payload);
        } catch (ConnectionException $exception) {
            throw new GatewayUnavailable("Mercado Pago is unreachable: {$exception->getMessage()}");
        }
    }

    private function isPaymentEvent(string $eventType): bool
    {
        return str_contains($eventType, 'payment') || str_contains($eventType, 'preapproval');
    }

    private function webhookEndpoint(string $eventType): string
    {
        if (str_contains($eventType, 'authorized_payment')) {
            return '/authorized_payments';
        }

        return str_contains($eventType, 'preapproval') ? '/preapproval' : '/v1/payments';
    }
}

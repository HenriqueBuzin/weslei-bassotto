<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Payments\ChargeRequest;
use App\Payments\ChargeResult;
use App\Payments\GatewayRegistry;
use App\Payments\PaymentGateway;
use App\Payments\PaymentStatus;
use App\Payments\WebhookEvent;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class GatewayRegistryTest extends TestCase
{
    public function test_resolves_a_registered_gateway_by_name(): void
    {
        $registry = $this->registry(['alpha', 'beta'], ['alpha', 'beta']);

        $this->assertSame('beta', $registry->get('beta')->name());
    }

    public function test_rejects_an_unregistered_gateway(): void
    {
        $registry = $this->registry(['alpha'], ['alpha']);

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown gateway: stripe');

        $registry->get('stripe');
    }

    public function test_candidates_follow_the_configured_order(): void
    {
        $registry = $this->registry(['alpha', 'beta'], ['beta', 'alpha']);

        $this->assertSame(['beta', 'alpha'], $this->names($registry->candidates()));
    }

    public function test_a_preferred_gateway_is_tried_first(): void
    {
        $registry = $this->registry(['alpha', 'beta'], ['alpha', 'beta']);

        $this->assertSame(['beta', 'alpha'], $this->names($registry->candidates('beta')));
    }

    public function test_a_preferred_gateway_is_not_duplicated(): void
    {
        $registry = $this->registry(['alpha', 'beta'], ['alpha', 'beta']);

        $this->assertSame(['alpha', 'beta'], $this->names($registry->candidates('alpha')));
    }

    public function test_an_unknown_preference_is_ignored(): void
    {
        $registry = $this->registry(['alpha'], ['alpha']);

        $this->assertSame(['alpha'], $this->names($registry->candidates('stripe')));
    }

    public function test_an_empty_preference_is_ignored(): void
    {
        $registry = $this->registry(['alpha'], ['alpha']);

        $this->assertSame(['alpha'], $this->names($registry->candidates('')));
    }

    public function test_order_entries_without_a_registered_gateway_are_skipped(): void
    {
        $registry = $this->registry(['alpha'], ['ghost', 'alpha']);

        $this->assertSame(['alpha'], $this->names($registry->candidates()));
    }

    public function test_a_duplicated_order_entry_yields_one_candidate(): void
    {
        $registry = $this->registry(['alpha'], ['alpha', 'alpha']);

        $this->assertSame(['alpha'], $this->names($registry->candidates()));
    }

    public function test_an_empty_registry_has_no_candidates(): void
    {
        $this->assertSame([], $this->registry([], ['alpha'])->candidates());
    }

    /**
     * @param  list<string>  $gateways
     * @param  list<string>  $order
     */
    private function registry(array $gateways, array $order): GatewayRegistry
    {
        return new GatewayRegistry(
            array_map(fn (string $name): PaymentGateway => $this->fakeGateway($name), $gateways),
            $order,
        );
    }

    /**
     * @param  list<PaymentGateway>  $gateways
     * @return list<string>
     */
    private function names(array $gateways): array
    {
        return array_map(fn (PaymentGateway $gateway): string => $gateway->name(), $gateways);
    }

    private function fakeGateway(string $name): PaymentGateway
    {
        return new class($name) implements PaymentGateway
        {
            public function __construct(private readonly string $gatewayName) {}

            public function name(): string
            {
                return $this->gatewayName;
            }

            public function createCharge(ChargeRequest $request): ChargeResult
            {
                return new ChargeResult($this->gatewayName, 'external-1', PaymentStatus::Approved);
            }

            public function parseWebhook(array $payload): ?WebhookEvent
            {
                return null;
            }
        };
    }
}

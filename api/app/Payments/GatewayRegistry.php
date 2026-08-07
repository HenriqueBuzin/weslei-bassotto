<?php

declare(strict_types=1);

namespace App\Payments;

use InvalidArgumentException;

final class GatewayRegistry
{
    /** @var array<string, PaymentGateway> */
    private array $gateways = [];

    /**
     * @param  iterable<PaymentGateway>  $gateways
     * @param  list<string>  $order
     */
    public function __construct(iterable $gateways, private readonly array $order)
    {
        foreach ($gateways as $gateway) {
            $this->gateways[$gateway->name()] = $gateway;
        }
    }

    public function get(string $name): PaymentGateway
    {
        $gateway = $this->gateways[$name] ?? null;

        if ($gateway === null) {
            throw new InvalidArgumentException("Unknown gateway: {$name}");
        }

        return $gateway;
    }

    /**
     * @return list<PaymentGateway>
     */
    public function candidates(?string $preferred = null): array
    {
        $names = $preferred !== null && $preferred !== '' ? [$preferred, ...$this->order] : $this->order;
        $selected = [];

        foreach ($names as $name) {
            if (! in_array($name, $selected, true) && isset($this->gateways[$name])) {
                $selected[] = $name;
            }
        }

        return array_map(fn (string $name): PaymentGateway => $this->gateways[$name], $selected);
    }
}

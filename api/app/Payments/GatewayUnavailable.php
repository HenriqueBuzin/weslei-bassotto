<?php

declare(strict_types=1);

namespace App\Payments;

/** The gateway cannot be used before a charge is submitted, so fallback is safe. */
class GatewayUnavailable extends GatewayException {}

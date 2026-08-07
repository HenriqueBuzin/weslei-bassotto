<?php

declare(strict_types=1);

namespace App\Payments;

/** The gateway answered: no other gateway may retry the same purchase automatically. */
class GatewayRejected extends GatewayException {}

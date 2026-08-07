<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

Schedule::command('platform:prune')->dailyAt('03:30');

<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

class AdminController extends Controller
{
    public function secret(): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'msg' => 'admin only content']);
    }
}

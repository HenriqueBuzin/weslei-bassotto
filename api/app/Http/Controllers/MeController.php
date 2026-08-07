<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function show(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }
}

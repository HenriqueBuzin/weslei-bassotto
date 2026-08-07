<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\PlanCatalog;
use App\Http\Resources\PlanResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class PlanController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return PlanResource::collection(array_values(PlanCatalog::all()));
    }
}

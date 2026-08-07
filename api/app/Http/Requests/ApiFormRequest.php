<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Shared base: authorization lives in the route middleware, and the wording of
 * validation errors lives in the frontend catalog keyed by `code`/`fields`.
 */
abstract class ApiFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function normalizedEmail(string $key): ?string
    {
        $value = $this->input($key);

        return is_string($value) ? strtolower(trim($value)) : null;
    }
}

<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Http\Requests\ApiFormRequest;

class LoginRequest extends ApiFormRequest
{
    /**
     * The e-mail is stored lowercase, so any casing must resolve to it. The
     * frontend posts "true"/"false", which the boolean rule would reject.
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            'username' => $this->normalizedEmail('username'),
            'remember' => $this->boolean('remember'),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }
}

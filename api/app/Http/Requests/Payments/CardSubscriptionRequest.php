<?php

declare(strict_types=1);

namespace App\Http\Requests\Payments;

use App\Domain\PlanCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CardSubscriptionRequest extends FormRequest
{
    public const MODES = ['cash', 'subscription'];

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'plan_slug' => ['required', Rule::in(PlanCatalog::SLUGS)],
            'payer_email' => ['required', 'email'],
            'card_token_id' => ['required', 'string'],
            'payment_method_id' => ['sometimes', 'nullable', 'string'],
            'payment_mode' => ['sometimes', Rule::in(self::MODES)],
            'gateway' => ['sometimes', 'nullable', 'string'],
        ];
    }

    public function mode(): string
    {
        return (string) $this->input('payment_mode', 'subscription');
    }
}

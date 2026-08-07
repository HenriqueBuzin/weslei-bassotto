<?php

declare(strict_types=1);

namespace App\Exceptions;

use Exception;
use Illuminate\Contracts\Support\Responsable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Every API error answers with a stable machine readable `code` plus an English
 * `detail`. The frontend translates the code, so wording changes here never
 * break the Portuguese copy shown to users.
 */
class ApiException extends Exception implements Responsable
{
    /**
     * `$errorCode` cannot be named `$code`: Exception already declares a
     * protected int $code, and redeclaring it as a readonly string is fatal.
     *
     * @param  array<string, mixed>  $extra
     */
    public function __construct(
        private readonly int $status,
        private readonly string $errorCode,
        string $detail,
        private readonly array $extra = [],
    ) {
        parent::__construct($detail);
    }

    public static function badRequest(string $code, string $detail): self
    {
        return new self(400, $code, $detail);
    }

    public static function unauthorized(string $code, string $detail): self
    {
        return new self(401, $code, $detail);
    }

    public static function paymentRequired(string $code, string $detail): self
    {
        return new self(402, $code, $detail);
    }

    public static function forbidden(string $code, string $detail): self
    {
        return new self(403, $code, $detail);
    }

    public static function notFound(string $code, string $detail): self
    {
        return new self(404, $code, $detail);
    }

    public static function conflict(string $code, string $detail): self
    {
        return new self(409, $code, $detail);
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    public static function unprocessable(string $code, string $detail, array $extra = []): self
    {
        return new self(422, $code, $detail, $extra);
    }

    public static function tooManyRequests(string $code, string $detail): self
    {
        return new self(429, $code, $detail);
    }

    public static function badGateway(string $code, string $detail): self
    {
        return new self(502, $code, $detail);
    }

    public function toResponse($request): JsonResponse
    {
        return new JsonResponse([
            'code' => $this->errorCode,
            'detail' => $this->getMessage(),
            ...$this->extra,
        ], $this->status);
    }

    public function render(Request $request): JsonResponse
    {
        return $this->toResponse($request);
    }
}

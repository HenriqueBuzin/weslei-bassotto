from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any, Protocol


class PaymentStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class ChargeRequest:
    reference: str
    description: str
    amount: Decimal
    payer_email: str
    card_token: str
    payment_method_id: str | None
    mode: str
    installments: int


@dataclass(frozen=True, slots=True)
class ChargeResult:
    gateway: str
    external_id: str
    status: PaymentStatus
    status_detail: str | None = None
    raw: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class WebhookEvent:
    event_id: str
    external_id: str
    status: PaymentStatus
    status_detail: str | None = None
    raw: dict[str, Any] | None = None


class PaymentGateway(Protocol):
    name: str

    async def create_charge(self, request: ChargeRequest) -> ChargeResult: ...

    async def parse_webhook(self, payload: dict[str, Any]) -> WebhookEvent | None: ...

import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

import httpx

from app.domain.plans import add_months
from app.payments.contracts import ChargeRequest, ChargeResult, PaymentStatus, WebhookEvent


class GatewayError(RuntimeError):
    pass


class GatewayUnavailable(GatewayError):
    """The gateway cannot be used before a charge is submitted."""


class GatewayRejected(GatewayError):
    """The gateway answered; another gateway must not retry the same purchase automatically."""


class MercadoPagoGateway:
    name = "mercado_pago"

    def __init__(self, access_token: str, public_url: str, *, client: httpx.AsyncClient | None = None):
        self.access_token = access_token
        self.public_url = public_url.rstrip("/")
        self._client = client

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}", "Content-Type": "application/json"}

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        if not self.access_token:
            raise GatewayUnavailable("MERCADO_PAGO_ACCESS_TOKEN não configurado")
        if self._client:
            return await self._client.request(method, url, **kwargs)
        async with httpx.AsyncClient(timeout=20) as client:
            return await client.request(method, url, **kwargs)

    @staticmethod
    def _status(value: str | None) -> PaymentStatus:
        normalized = (value or "").lower()
        if normalized in {"approved", "authorized", "active"}:
            return PaymentStatus.APPROVED
        if normalized in {"cancelled", "canceled"}:
            return PaymentStatus.CANCELLED
        if normalized in {"rejected", "paused", "expired"}:
            return PaymentStatus.FAILED
        return PaymentStatus.PENDING

    async def create_charge(self, request: ChargeRequest) -> ChargeResult:
        if request.mode == "cash":
            payload: dict[str, Any] = {
                "transaction_amount": float(request.amount),
                "token": request.card_token,
                "description": request.description,
                "installments": 1,
                "payer": {"email": request.payer_email},
                "external_reference": request.reference,
            }
            if request.payment_method_id:
                payload["payment_method_id"] = request.payment_method_id
            headers = {**self.headers, "X-Idempotency-Key": request.reference}
            response = await self._request(
                "POST", "https://api.mercadopago.com/v1/payments", headers=headers, json=payload
            )
        else:
            payload = {
                "reason": request.description,
                "external_reference": request.reference,
                "payer_email": request.payer_email,
                "card_token_id": request.card_token,
                "auto_recurring": {
                    "frequency": 1,
                    "frequency_type": "months",
                    "start_date": datetime.now(UTC).replace(microsecond=0).isoformat(),
                    "end_date": datetime.combine(
                        add_months(datetime.now(UTC).date(), request.installments),
                        datetime.max.time().replace(microsecond=0),
                        tzinfo=UTC,
                    ).isoformat(),
                    "transaction_amount": float(request.amount),
                    "currency_id": "BRL",
                },
                "back_url": f"{self.public_url}/pagamento/retorno",
                "status": "authorized",
            }
            if request.payment_method_id:
                payload["payment_method_id"] = request.payment_method_id
            response = await self._request(
                "POST", "https://api.mercadopago.com/preapproval", headers=self.headers, json=payload
            )
        if response.status_code >= 400:
            raise GatewayRejected(f"Mercado Pago recusou a operação ({response.status_code}): {response.text}")
        data = response.json()
        return ChargeResult(
            gateway=self.name,
            external_id=str(data["id"]),
            status=self._status(data.get("status")),
            status_detail=data.get("status_detail"),
            raw=data,
        )

    async def parse_webhook(self, payload: dict[str, Any]) -> WebhookEvent | None:
        event_type = str(payload.get("type") or payload.get("topic") or "")
        external_id = payload.get("data", {}).get("id") or payload.get("id")
        if not external_id or not any(item in event_type for item in ("payment", "preapproval")):
            return None
        if "authorized_payment" in event_type:
            endpoint = "authorized_payments"
        elif "preapproval" in event_type:
            endpoint = "preapproval"
        else:
            endpoint = "v1/payments"
        response = await self._request(
            "GET", f"https://api.mercadopago.com/{endpoint}/{external_id}", headers=self.headers
        )
        if response.status_code >= 400:
            raise GatewayError(f"Não foi possível consultar o pagamento ({response.status_code})")
        data = response.json()
        event_id = str(payload.get("id") or f"{event_type}:{external_id}:{data.get('status')}")
        matched_external_id = data.get("preapproval_id") if "authorized_payment" in event_type else external_id
        return WebhookEvent(
            event_id=event_id,
            external_id=str(matched_external_id or external_id),
            status=self._status(data.get("status")),
            status_detail=data.get("status_detail"),
            raw=data,
        )


def verify_webhook_signature(*, signature: str, request_id: str, data_id: str, secret: str) -> bool:
    parts = dict(item.split("=", 1) for item in signature.split(",") if "=" in item)
    timestamp, received = parts.get("ts"), parts.get("v1")
    if not timestamp or not received or not request_id or not data_id or not secret:
        return False
    manifest = f"id:{data_id.lower()};request-id:{request_id};ts:{timestamp};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received)

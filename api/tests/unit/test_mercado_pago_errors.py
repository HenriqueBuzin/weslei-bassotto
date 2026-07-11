from decimal import Decimal

import httpx
import pytest

from app.payments.contracts import ChargeRequest, PaymentStatus
from app.payments.mercado_pago import GatewayError, GatewayRejected, GatewayUnavailable, MercadoPagoGateway


def request(mode="cash", method=None):
    return ChargeRequest(
        reference="payment:1", description="Plano", amount=Decimal("100.00"), payer_email="card@example.com",
        card_token="token", payment_method_id=method, mode=mode, installments=3,
    )


@pytest.mark.asyncio
async def test_gateway_requires_token_before_request():
    with pytest.raises(GatewayUnavailable):
        await MercadoPagoGateway("", "https://example.com").create_charge(request())


@pytest.mark.asyncio
async def test_cash_payload_and_rejected_response():
    captured = {}

    def handler(http_request):
        captured["body"] = http_request.content
        captured["idempotency"] = http_request.headers["X-Idempotency-Key"]
        return httpx.Response(422, text="invalid")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = MercadoPagoGateway("token", "https://example.com/", client=client)
        assert gateway.public_url == "https://example.com"
        with pytest.raises(GatewayRejected, match="422"):
            await gateway.create_charge(request(method="visa"))
    assert captured["idempotency"] == "payment:1"
    assert b'"installments":1' in captured["body"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [("authorized", PaymentStatus.APPROVED), ("cancelled", PaymentStatus.CANCELLED),
     ("paused", PaymentStatus.FAILED), (None, PaymentStatus.PENDING)],
)
def test_status_mapping(value, expected):
    assert MercadoPagoGateway._status(value) == expected


@pytest.mark.asyncio
async def test_webhook_ignores_unrelated_payloads_and_maps_endpoints():
    assert await MercadoPagoGateway("token", "https://example.com").parse_webhook({"type": "merchant_order"}) is None
    seen = []

    def handler(http_request):
        seen.append(str(http_request.url))
        return httpx.Response(200, json={"id": "x", "status": "cancelled"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = MercadoPagoGateway("token", "https://example.com", client=client)
        event1 = await gateway.parse_webhook({"topic": "preapproval", "id": "pre-1"})
        event2 = await gateway.parse_webhook({"type": "payment", "data": {"id": "pay-1"}})
    assert event1.status == PaymentStatus.CANCELLED
    assert event2.event_id == "payment:pay-1:cancelled"
    assert "/preapproval/pre-1" in seen[0] and "/v1/payments/pay-1" in seen[1]


@pytest.mark.asyncio
async def test_webhook_lookup_error_is_reported():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(500))) as client:
        gateway = MercadoPagoGateway("token", "https://example.com", client=client)
        with pytest.raises(GatewayError, match="500"):
            await gateway.parse_webhook({"type": "payment", "data": {"id": "pay-1"}})

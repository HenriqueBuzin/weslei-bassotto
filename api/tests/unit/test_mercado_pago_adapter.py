import httpx
import pytest

from app.payments.contracts import ChargeRequest
from app.payments.mercado_pago import MercadoPagoGateway


@pytest.mark.asyncio
async def test_subscription_has_a_fixed_end_date():
    captured = {}

    def handler(request):
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(201, json={"id": "pre-1", "status": "authorized"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = MercadoPagoGateway("token", "https://example.com", client=client)
        result = await gateway.create_charge(ChargeRequest(
            reference="payment:1", description="Plano", amount=__import__("decimal").Decimal("182.23"),
            payer_email="card@example.com", card_token="card-token", payment_method_id="master",
            mode="subscription", installments=6,
        ))

    assert result.status == "approved"
    assert captured["auto_recurring"]["end_date"] > captured["auto_recurring"]["start_date"]


@pytest.mark.asyncio
async def test_authorized_payment_webhook_maps_back_to_subscription():
    def handler(request):
        return httpx.Response(200, json={"id": "invoice-1", "preapproval_id": "pre-1", "status": "rejected"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = MercadoPagoGateway("token", "https://example.com", client=client)
        event = await gateway.parse_webhook({"id": "evt", "type": "subscription_authorized_payment", "data": {"id": "invoice-1"}})

    assert event.external_id == "pre-1"
    assert event.status == "failed"

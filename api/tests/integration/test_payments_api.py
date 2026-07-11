import hashlib
import hmac
from datetime import UTC, datetime

import pytest
from bson import ObjectId

from app.payments.contracts import ChargeResult, PaymentStatus
from app.payments.registry import GatewayRegistry


class FakeGateway:
    name = "fake"

    async def create_charge(self, request):
        return ChargeResult(self.name, f"charge-{request.reference}", PaymentStatus.APPROVED)

    async def parse_webhook(self, payload):
        return None


@pytest.mark.asyncio
async def test_card_payment_and_secret_status_endpoint(client, db, user_factory, auth_headers, monkeypatch):
    user = await user_factory()
    registry = GatewayRegistry([FakeGateway()], ["fake"])
    monkeypatch.setattr("app.routers.payments.build_gateway_registry", lambda: registry)
    created = await client.post("/api/v1/payments/card-subscription", json={
        "plan_slug": "trimestral", "payer_email": "card@example.com", "card_token_id": "token",
        "payment_method_id": "visa", "payment_mode": "cash", "gateway": "fake",
    }, headers=auth_headers(user))
    assert created.status_code == 200
    data = created.json()
    assert data["status"] == "approved"

    status = await client.get(f"/api/v1/payments/{data['payment_id']}/status", params={"token": data["payment_token"]})
    assert status.status_code == 200
    denied = await client.get(f"/api/v1/payments/{data['payment_id']}/status", params={"token": "wrong"})
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_renewal_payment_enforces_contract_owner(client, db, user_factory, auth_headers, monkeypatch):
    owner = await user_factory("owner@example.com")
    other = await user_factory("other@example.com")
    submission_id = ObjectId()
    await db.consultancy_submissions.insert_one({
        "_id": submission_id, "customer": {"email": owner["email"]},
        "plan": {"slug": "trimestral", "name": "Plano Trimestral", "months": 3, "start_date": "2026-01-01", "end_date": "2026-04-01"},
        "status": "active", "answers": [], "renewals": [], "renewal_count": 0,
        "created_at": datetime.now(UTC), "updated_at": datetime.now(UTC),
    })
    registry = GatewayRegistry([FakeGateway()], ["fake"])
    monkeypatch.setattr("app.routers.payments.build_gateway_registry", lambda: registry)
    payload = {"plan_slug": "semestral", "payer_email": "card@example.com", "card_token_id": "token", "payment_mode": "subscription", "gateway": "fake"}
    forbidden = await client.post(f"/api/v1/payments/me/renewals/{submission_id}", json=payload, headers=auth_headers(other))
    assert forbidden.status_code == 403
    approved = await client.post(f"/api/v1/payments/me/renewals/{submission_id}", json=payload, headers=auth_headers(owner))
    assert approved.status_code == 200
    renewed = await db.consultancy_submissions.find_one({"_id": submission_id})
    assert renewed["renewal_count"] == 1


@pytest.mark.asyncio
async def test_mercado_pago_webhook_rejects_bad_signature(client):
    response = await client.post(
        "/api/v1/payments/webhooks/mercado_pago?data.id=123",
        json={"type": "payment", "data": {"id": "123"}},
        headers={"x-signature": "ts=1,v1=bad", "x-request-id": "req"},
    )
    assert response.status_code == 401

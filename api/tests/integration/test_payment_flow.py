from dataclasses import replace

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.payments.contracts import ChargeResult, PaymentStatus, WebhookEvent
from app.payments.mercado_pago import GatewayRejected, GatewayUnavailable
from app.payments.registry import GatewayRegistry
from app.services.payments import apply_webhook, create_payment, get_claimed_approved_payment


class FakeGateway:
    name = "fake"

    def __init__(self):
        self.result = ChargeResult("fake", "charge-1", PaymentStatus.APPROVED)
        self.event = WebhookEvent("event-1", "charge-1", PaymentStatus.APPROVED)

    async def create_charge(self, request):
        return self.result

    async def parse_webhook(self, payload):
        return self.event


class UnavailableGateway(FakeGateway):
    name = "unavailable"

    async def create_charge(self, request):
        raise GatewayUnavailable("offline")


class RejectedGateway(FakeGateway):
    name = "rejected"

    async def create_charge(self, request):
        raise GatewayRejected("card rejected")


@pytest.fixture
def db():
    return AsyncMongoMockClient().db


@pytest.mark.asyncio
async def test_approved_payment_can_only_be_claimed_with_secret(db):
    gateway = FakeGateway()
    payment, secret = await create_payment(
        db,
        GatewayRegistry([gateway], ["fake"]),
        plan_slug="trimestral",
        mode="cash",
        payer_email="card@example.com",
        card_token="token",
        payment_method_id="visa",
    )
    assert payment["status"] == "approved"
    assert await get_claimed_approved_payment(db, str(payment["_id"]), secret)
    assert await get_claimed_approved_payment(db, str(payment["_id"]), "wrong") is None


@pytest.mark.asyncio
@pytest.mark.functional
@pytest.mark.regression
async def test_webhook_is_idempotent_and_renews_once(db):
    gateway = FakeGateway()
    gateway.result = replace(gateway.result, status=PaymentStatus.PENDING)
    submission_id = ObjectId()
    await db.consultancy_submissions.insert_one(
        {
            "_id": submission_id,
            "customer": {"email": "user@example.com"},
            "plan": {"end_date": "2026-08-01"},
            "renewal_count": 0,
            "renewals": [],
        }
    )
    payment, _ = await create_payment(
        db,
        GatewayRegistry([gateway], ["fake"]),
        plan_slug="semestral",
        mode="subscription",
        payer_email="card@example.com",
        card_token="token",
        payment_method_id="master",
        renewal_submission_id=str(submission_id),
        account_email="user@example.com",
    )
    registry = GatewayRegistry([gateway], ["fake"])
    assert await apply_webhook(db, registry, "fake", {}) is True
    assert await apply_webhook(db, registry, "fake", {}) is False
    renewed = await db.consultancy_submissions.find_one({"_id": submission_id})
    assert renewed["renewal_count"] == 1
    assert len(renewed["renewals"]) == 1


@pytest.mark.asyncio
async def test_unavailable_gateway_falls_back_to_next_adapter(db):
    payment, _ = await create_payment(
        db,
        GatewayRegistry([UnavailableGateway(), FakeGateway()], ["unavailable", "fake"]),
        plan_slug="trimestral",
        mode="cash",
        payer_email="card@example.com",
        card_token="token",
        payment_method_id="visa",
    )
    assert payment["gateway"] == "fake"
    assert len((await db.payments.find_one({"_id": payment["_id"]}))["attempts"]) == 2


@pytest.mark.asyncio
async def test_rejected_charge_does_not_try_another_gateway(db):
    with pytest.raises(GatewayRejected):
        await create_payment(
            db,
            GatewayRegistry([RejectedGateway(), FakeGateway()], ["rejected", "fake"]),
            plan_slug="trimestral",
            mode="cash",
            payer_email="card@example.com",
            card_token="token",
            payment_method_id="visa",
        )
    payment = await db.payments.find_one({})
    assert payment["status"] == "failed"
    assert len(payment["attempts"]) == 1

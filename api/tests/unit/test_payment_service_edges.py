from dataclasses import replace
from datetime import UTC, datetime

import pytest
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.payments.contracts import ChargeResult, PaymentStatus, WebhookEvent
from app.payments.mercado_pago import GatewayUnavailable
from app.payments.registry import GatewayRegistry
from app.services.contracts import activate_contract
from app.services.payments import apply_webhook, create_payment, get_claimed_approved_payment


class Gateway:
    name = "fake"

    def __init__(self, result=None, event=None):
        self.result = result or ChargeResult("fake", "charge-1", PaymentStatus.FAILED, "declined")
        self.event = event

    async def create_charge(self, request):
        return self.result

    async def parse_webhook(self, payload):
        return self.event


class Offline(Gateway):
    async def create_charge(self, request):
        raise GatewayUnavailable("offline")


@pytest.mark.asyncio
async def test_failed_result_creates_alert_and_all_offline_is_recorded(db):
    failed, _ = await create_payment(
        db, GatewayRegistry([Gateway()], ["fake"]), plan_slug="trimestral", mode="subscription",
        payer_email="CARD@example.com", card_token="token", payment_method_id=None, account_email=None,
    )
    assert failed["status"] == "failed"
    assert await db.admin_events.find_one({"payment_id": failed["_id"]})
    with pytest.raises(GatewayUnavailable):
        await create_payment(
            db, GatewayRegistry([Offline()], ["fake"]), plan_slug="trimestral", mode="cash",
            payer_email="card@example.com", card_token="token", payment_method_id=None,
        )
    assert await db.payments.find_one({"status_detail": {"$regex": "offline"}})
    assert await get_claimed_approved_payment(db, "invalid", "") is None


@pytest.mark.asyncio
async def test_webhook_none_unmatched_failed_renewal_and_already_approved(db):
    registry = GatewayRegistry([Gateway(event=None)], ["fake"])
    assert await apply_webhook(db, registry, "fake", {}) is False

    unmatched = Gateway(event=WebhookEvent("unmatched", "missing", PaymentStatus.PENDING))
    assert await apply_webhook(db, GatewayRegistry([unmatched], ["fake"]), "fake", {}) is False

    submission_id, payment_id = ObjectId(), ObjectId()
    await db.consultancy_submissions.insert_one({"_id": submission_id})
    await db.payments.insert_one({"_id": payment_id, "gateway": "fake", "external_id": "charge-failed",
        "status": "pending", "renewal_submission_id": str(submission_id)})
    failed = Gateway(event=WebhookEvent("failed", "charge-failed", PaymentStatus.FAILED, "declined"))
    assert await apply_webhook(db, GatewayRegistry([failed], ["fake"]), "fake", {}) is True
    assert (await db.consultancy_submissions.find_one({"_id": submission_id}))["recurrence_status"] == "failed"

    plain_id = ObjectId()
    await db.payments.insert_one({"_id": plain_id, "gateway": "fake", "external_id": "plain-failed", "status": "pending"})
    plain_failed = Gateway(event=WebhookEvent("plain-failed", "plain-failed", PaymentStatus.FAILED))
    assert await apply_webhook(db, GatewayRegistry([plain_failed], ["fake"]), "fake", {}) is True

    approved_id = ObjectId()
    await db.payments.insert_one({"_id": approved_id, "gateway": "fake", "external_id": "already",
        "status": "approved", "plan_slug": "trimestral"})
    approved = Gateway(event=WebhookEvent("approved-again", "already", PaymentStatus.APPROVED))
    assert await apply_webhook(db, GatewayRegistry([approved], ["fake"]), "fake", {}) is True


@pytest.mark.asyncio
async def test_duplicate_webhook_insert_is_idempotent(monkeypatch):
    class Events:
        async def find_one(self, query): return None
        async def insert_one(self, doc): raise DuplicateKeyError("duplicate")
    class Payments:
        async def find_one(self, query): return {"_id": ObjectId(), "status": "pending"}
    db = type("Db", (), {"payment_webhook_events": Events(), "payments": Payments()})()
    gateway = Gateway(event=WebhookEvent("duplicate", "charge", PaymentStatus.PENDING))
    assert await apply_webhook(db, GatewayRegistry([gateway], ["fake"]), "fake", {}) is False


@pytest.mark.asyncio
async def test_contract_activation_handles_replays_missing_contract_and_event_failure(db, monkeypatch):
    payment_id, submission_id = ObjectId(), ObjectId()
    payment = {"_id": payment_id, "plan_slug": "trimestral", "gateway": "fake", "external_id": "charge",
               "status": "approved", "renewal_submission_id": str(submission_id)}
    await db.payments.insert_one({**payment, "contract_activated_at": datetime.now(UTC)})
    assert await activate_contract(db, payment) is None

    await db.payments.update_one({"_id": payment_id}, {"$unset": {"contract_activated_at": ""}})
    assert await activate_contract(db, payment) is None

    no_renewal = {**payment, "_id": ObjectId(), "renewal_submission_id": None}
    await db.payments.insert_one(no_renewal)
    assert await activate_contract(db, no_renewal) is None

    current = {"_id": submission_id, "plan": {"end_date": "2026-08-01"}, "renewal_count": 0, "renewals": []}
    await db.consultancy_submissions.insert_one(current)
    event_collection = db.contract_events
    monkeypatch.setattr(event_collection, "insert_one", _raise_async)
    fresh = {**payment, "_id": ObjectId()}
    await db.payments.insert_one(fresh)
    assert await activate_contract(db, fresh) is not None


async def _raise_async(*args, **kwargs):
    raise RuntimeError("duplicate event")


@pytest.mark.asyncio
async def test_contract_event_insert_exception_is_ignored(db):
    submission_id, payment_id = ObjectId(), ObjectId()
    await db.consultancy_submissions.insert_one({
        "_id": submission_id, "plan": {"end_date": "2026-08-01"}, "renewal_count": 0, "renewals": []
    })
    await db.payments.insert_one({"_id": payment_id})

    class BrokenEvents:
        async def find_one(self, query): return None
        async def insert_one(self, doc): raise RuntimeError("duplicate")

    class DbProxy:
        payments = db.payments
        consultancy_submissions = db.consultancy_submissions
        contract_events = BrokenEvents()
        admin_events = db.admin_events

    payment = {"_id": payment_id, "plan_slug": "trimestral", "gateway": "fake", "external_id": "charge",
               "status": "approved", "renewal_submission_id": str(submission_id)}
    assert await activate_contract(DbProxy(), payment) is not None

import hashlib
import secrets
from datetime import UTC, datetime
from typing import Any

from app.db.contracts import DuplicateKeyError, RecordId
from app.domain.plans import get_plan
from app.payments.contracts import ChargeRequest, PaymentStatus
from app.payments.mercado_pago import GatewayRejected, GatewayUnavailable
from app.payments.registry import GatewayRegistry
from app.services.contracts import activate_contract, create_admin_event


def now() -> datetime:
    return datetime.now(UTC)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def create_payment(
    db,
    registry: GatewayRegistry,
    *,
    plan_slug: str,
    mode: str,
    payer_email: str,
    card_token: str,
    payment_method_id: str | None,
    renewal_submission_id: str | None = None,
    account_email: str | None = None,
    preferred_gateway: str | None = None,
) -> tuple[dict[str, Any], str]:
    plan = get_plan(plan_slug)
    claim_token = secrets.token_urlsafe(32)
    payment_id = RecordId()
    reference = f"payment:{payment_id}"
    amount = plan.cash_amount if mode == "cash" else plan.monthly_amount
    timestamp = now()
    doc: dict[str, Any] = {
        "_id": payment_id,
        "plan_slug": plan_slug,
        "mode": mode,
        "amount": str(amount),
        "payer_email": payer_email.lower(),
        "account_email": account_email.lower() if account_email else None,
        "renewal_submission_id": renewal_submission_id,
        "claim_token_hash": token_hash(claim_token),
        "status": PaymentStatus.PENDING.value,
        "attempts": [],
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await db.payments.insert_one(doc)
    errors = []
    for gateway in registry.candidates(preferred_gateway):
        try:
            result = await gateway.create_charge(
                ChargeRequest(
                    reference=reference,
                    description=f"{plan.name} - {'à vista' if mode == 'cash' else f'{plan.months} cobranças mensais'}",
                    amount=amount,
                    payer_email=payer_email,
                    card_token=card_token,
                    payment_method_id=payment_method_id,
                    mode=mode,
                    installments=1 if mode == "cash" else plan.months,
                )
            )
            update = {
                "gateway": result.gateway,
                "external_id": result.external_id,
                "status": result.status.value,
                "status_detail": result.status_detail,
                "updated_at": now(),
            }
            await db.payments.update_one(
                {"_id": payment_id},
                {"$set": update, "$push": {"attempts": {**update, "created_at": now()}}},
            )
            doc.update(update)
            if result.status == PaymentStatus.APPROVED and renewal_submission_id:
                await activate_contract(db, doc)
            elif result.status == PaymentStatus.FAILED:
                await create_admin_event(db, "payment_failed", payment_id=payment_id)
            return doc, claim_token
        except GatewayRejected as exc:
            await db.payments.update_one(
                {"_id": payment_id},
                {
                    "$set": {"status": PaymentStatus.FAILED.value, "status_detail": str(exc), "updated_at": now()},
                    "$push": {
                        "attempts": {
                            "gateway": gateway.name,
                            "status": "rejected",
                            "detail": str(exc),
                            "created_at": now(),
                        }
                    },
                },
            )
            await create_admin_event(db, "payment_failed", payment_id=payment_id)
            raise
        except GatewayUnavailable as exc:
            errors.append(f"{gateway.name}: {exc}")
            await db.payments.update_one(
                {"_id": payment_id},
                {
                    "$push": {
                        "attempts": {
                            "gateway": gateway.name,
                            "status": "unavailable",
                            "detail": str(exc),
                            "created_at": now(),
                        }
                    }
                },
            )
    await db.payments.update_one(
        {"_id": payment_id},
        {"$set": {"status": PaymentStatus.FAILED.value, "status_detail": "; ".join(errors), "updated_at": now()}},
    )
    await create_admin_event(db, "payment_failed", payment_id=payment_id)
    raise GatewayUnavailable("Nenhum gateway conseguiu iniciar a cobrança")


async def apply_webhook(db, registry: GatewayRegistry, gateway_name: str, payload: dict[str, Any]) -> bool:
    event = await registry.get(gateway_name).parse_webhook(payload)
    if not event:
        return False
    if await db.payment_webhook_events.find_one({"gateway": gateway_name, "event_id": event.event_id}):
        return False
    payment = await db.payments.find_one({"gateway": gateway_name, "external_id": event.external_id})
    try:
        await db.payment_webhook_events.insert_one(
            {
                "gateway": gateway_name,
                "event_id": event.event_id,
                "external_id": event.external_id,
                "received_at": now(),
                "matched": bool(payment),
            }
        )
    except DuplicateKeyError:
        return False
    if not payment:
        return False
    previous = payment["status"]
    await db.payments.update_one(
        {"_id": payment["_id"]},
        {"$set": {"status": event.status.value, "status_detail": event.status_detail, "updated_at": now()}},
    )
    payment.update(status=event.status.value, status_detail=event.status_detail)
    if event.status == PaymentStatus.APPROVED and previous != PaymentStatus.APPROVED.value:
        await activate_contract(db, payment)
    elif event.status == PaymentStatus.FAILED:
        await create_admin_event(db, "payment_failed", payment_id=payment["_id"])
        if payment.get("renewal_submission_id"):
            await db.consultancy_submissions.update_one(
                {"_id": RecordId(payment["renewal_submission_id"])},
                {
                    "$set": {
                        "recurrence_status": "failed",
                        "recurrence_issue": event.status_detail or "Cobrança recusada",
                        "updated_at": now(),
                    }
                },
            )
    return True


async def get_claimed_approved_payment(db, payment_id: str, claim_token: str) -> dict[str, Any] | None:
    if not RecordId.is_valid(payment_id) or not claim_token:
        return None
    return await db.payments.find_one(
        {
            "_id": RecordId(payment_id),
            "claim_token_hash": token_hash(claim_token),
            "status": PaymentStatus.APPROVED.value,
        }
    )

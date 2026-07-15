from datetime import UTC, date, datetime
from typing import Any

from bson import ObjectId

from app.domain.plans import contract_period, get_plan


def now() -> datetime:
    return datetime.now(UTC)


async def activate_contract(db, payment: dict[str, Any]) -> dict[str, Any] | None:
    """Create or renew a contract exactly once for an approved payment."""
    claimed = await db.payments.update_one(
        {"_id": payment["_id"], "contract_activated_at": {"$exists": False}},
        {"$set": {"contract_activated_at": now()}},
    )
    if claimed.modified_count != 1:
        existing = await db.contract_events.find_one({"payment_id": payment["_id"], "type": "contract_activated"})
        return await db.consultancy_submissions.find_one({"_id": existing["submission_id"]}) if existing else None

    plan = get_plan(payment["plan_slug"])
    timestamp = now()
    if payment.get("renewal_submission_id"):
        submission_id = ObjectId(payment["renewal_submission_id"])
        current = await db.consultancy_submissions.find_one({"_id": submission_id})
        if not current:
            return None
        current_end = date.fromisoformat(current["plan"]["end_date"])
        start, end = contract_period(plan.months, current_end=current_end)
        renewal = {
            "plan_slug": plan.slug,
            "plan_name": plan.name,
            "months": plan.months,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "payment_id": str(payment["_id"]),
            "gateway": payment["gateway"],
            "payment_reference": payment.get("external_id"),
            "created_at": timestamp,
        }
        await db.consultancy_submissions.update_one(
            {"_id": submission_id},
            {
                "$set": {
                    "plan": {
                        "slug": plan.slug,
                        "name": plan.name,
                        "months": plan.months,
                        "start_date": start.isoformat(),
                        "end_date": end.isoformat(),
                    },
                    "status": "active",
                    "payment_reference": payment.get("external_id"),
                    "payment_id": str(payment["_id"]),
                    "recurrence_status": payment["status"],
                    "recurrence_issue": None,
                    "last_renewed_at": timestamp,
                    "updated_at": timestamp,
                },
                "$inc": {"renewal_count": 1},
                "$push": {"renewals": renewal},
            },
        )
    else:
        return None

    try:
        await db.contract_events.insert_one(
            {
                "payment_id": payment["_id"],
                "submission_id": submission_id,
                "type": "contract_activated",
                "created_at": timestamp,
            }
        )
    except Exception:
        pass
    await create_admin_event(db, "renewal_approved", submission_id=submission_id, payment_id=payment["_id"])
    return await db.consultancy_submissions.find_one({"_id": submission_id})


async def create_admin_event(db, event_type: str, **data) -> None:
    await db.admin_events.insert_one({"type": event_type, "seen_at": None, "created_at": now(), **data})

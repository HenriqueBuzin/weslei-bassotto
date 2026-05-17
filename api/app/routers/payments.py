from datetime import UTC, date, datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.deps import get_current_user
from app.core.settings import settings
from app.schemas.payment import CardSubscriptionIn, CheckoutIn, CheckoutOut, RenewalCheckoutIn, SubscriptionOut

router = APIRouter(prefix="/payments", tags=["payments"])

PLANS = {
    "trimestral": {"name": "Plano Trimestral", "months": 3, "cash": 597.00, "subscription_total": 638.00},
    "semestral": {"name": "Plano Semestral", "months": 6, "cash": 997.00, "subscription_total": 1093.00},
    "anual": {"name": "Plano Anual", "months": 12, "cash": 1597.00, "subscription_total": 1863.00},
}


def public_url(path: str, params: dict[str, str]) -> str:
    base = settings.app_public_url.rstrip("/")
    return f"{base}{path}?{urlencode(params)}"


def monthly_amount(plan: dict) -> float:
    return round(plan["subscription_total"] / plan["months"], 2)


def add_months(source: date, months: int) -> date:
    month = source.month - 1 + months
    year = source.year + month // 12
    month = month % 12 + 1
    days_in_month = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return source.replace(year=year, month=month, day=min(source.day, days_in_month[month - 1]))


def iso_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def public_end_date(months: int) -> str:
    end = add_months(date.today(), months)
    return datetime(end.year, end.month, end.day, 23, 59, 59, tzinfo=UTC).isoformat().replace("+00:00", "Z")


async def create_preapproval(payload: dict) -> CheckoutOut:
    if not settings.mercado_pago_access_token:
        raise HTTPException(
            status_code=500,
            detail="MERCADO_PAGO_ACCESS_TOKEN não configurado",
        )

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.mercadopago.com/preapproval",
            headers={
                "Authorization": f"Bearer {settings.mercado_pago_access_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=response.text)

    data = response.json()
    checkout_url = data.get("init_point") or data.get("sandbox_init_point")
    if not checkout_url:
        raise HTTPException(status_code=502, detail="Mercado Pago não retornou URL de assinatura")

    return CheckoutOut(preference_id=data["id"], checkout_url=checkout_url)


async def create_authorized_preapproval(payload: dict) -> SubscriptionOut:
    if not settings.mercado_pago_access_token:
        raise HTTPException(status_code=500, detail="MERCADO_PAGO_ACCESS_TOKEN não configurado")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.mercadopago.com/preapproval",
            headers={
                "Authorization": f"Bearer {settings.mercado_pago_access_token}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=response.text)

    data = response.json()
    return SubscriptionOut(preapproval_id=data["id"], status=data.get("status", "unknown"))


async def create_card_payment(payload: dict) -> SubscriptionOut:
    if not settings.mercado_pago_access_token:
        raise HTTPException(status_code=500, detail="MERCADO_PAGO_ACCESS_TOKEN não configurado")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            "https://api.mercadopago.com/v1/payments",
            headers={
                "Authorization": f"Bearer {settings.mercado_pago_access_token}",
                "Content-Type": "application/json",
                "X-Idempotency-Key": payload["external_reference"],
            },
            json=payload,
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=response.text)

    data = response.json()
    return SubscriptionOut(preapproval_id=str(data["id"]), status=data.get("status", "unknown"))


async def fetch_preapproval(preapproval_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"https://api.mercadopago.com/preapproval/{preapproval_id}",
            headers={"Authorization": f"Bearer {settings.mercado_pago_access_token}"},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=response.text)
    return response.json()


@router.post("/checkout", response_model=CheckoutOut)
async def checkout(data: CheckoutIn, req: Request):
    plan = PLANS[data.plan_slug]
    success_url = public_url("/questionario", {"plano": data.plan_slug, "email": data.payer_email})

    preapproval = {
        "reason": f"{plan['name']} - {plan['months']} cobranças mensais",
        "external_reference": f"new:{data.plan_slug}",
        "payer_email": data.payer_email,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "start_date": iso_now(),
            "end_date": public_end_date(plan["months"]),
            "transaction_amount": monthly_amount(plan),
            "currency_id": "BRL",
        },
        "back_urls": {
            "success": success_url,
            "pending": success_url,
            "failure": public_url("/", {"pagamento": "falhou", "plano": data.plan_slug}),
        },
        "back_url": success_url,
        "status": "pending",
    }
    return await create_preapproval(preapproval)


@router.post("/card-subscription", response_model=SubscriptionOut)
async def card_subscription(data: CardSubscriptionIn, req: Request):
    plan = PLANS[data.plan_slug]
    if data.payment_mode == "cash":
        payment = {
            "transaction_amount": plan["cash"],
            "token": data.card_token_id,
            "description": f"{plan['name']} - pagamento à vista",
            "installments": 1,
            "payment_method_id": data.payment_method_id,
            "payer": {"email": data.payer_email},
            "external_reference": f"cash:{data.plan_slug}:{data.payer_email}",
        }
        if not data.payment_method_id:
            payment.pop("payment_method_id")
        return await create_card_payment(payment)

    preapproval = {
        "reason": f"{plan['name']} - {plan['months']} cobranças mensais",
        "external_reference": f"new:{data.plan_slug}",
        "payer_email": data.payer_email,
        "card_token_id": data.card_token_id,
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "start_date": iso_now(),
            "end_date": public_end_date(plan["months"]),
            "transaction_amount": monthly_amount(plan),
            "currency_id": "BRL",
        },
        "back_url": public_url("/questionario", {"plano": data.plan_slug, "email": data.payer_email}),
        "status": "authorized",
    }
    if data.payment_method_id:
        preapproval["payment_method_id"] = data.payment_method_id
    return await create_authorized_preapproval(preapproval)


@router.post("/renewal-checkout", response_model=CheckoutOut)
async def renewal_checkout(data: RenewalCheckoutIn, req: Request, user=Depends(get_current_user)):
    plan = PLANS[data.plan_slug]
    success_url = public_url(
        "/assinante",
        {"plano": data.plan_slug, "renew": data.submission_id},
    )

    preapproval = {
        "reason": f"Renovação - {plan['name']} - {plan['months']} cobranças mensais",
        "external_reference": f"renew:{data.submission_id}:{data.plan_slug}",
        "payer_email": user["email"],
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "start_date": iso_now(),
            "end_date": public_end_date(plan["months"]),
            "transaction_amount": monthly_amount(plan),
            "currency_id": "BRL",
        },
        "back_urls": {
            "success": success_url,
            "pending": success_url,
            "failure": public_url("/assinante", {"pagamento": "falhou"}),
        },
        "back_url": success_url,
        "status": "pending",
    }
    return await create_preapproval(preapproval)


@router.post("/webhook/mercado-pago")
async def mercado_pago_webhook(req: Request):
    payload = await req.json()
    event_type = payload.get("type") or payload.get("topic") or ""
    data_id = payload.get("data", {}).get("id") or payload.get("id")

    if not data_id or "preapproval" not in event_type:
        return {"ok": True}

    db = req.app.state.db
    preapproval = await fetch_preapproval(data_id)
    status = preapproval.get("status") or "unknown"
    issue = None if status in {"authorized", "active"} else preapproval.get("status_detail") or status

    await db.consultancy_submissions.update_many(
        {"payment_reference": data_id},
        {
            "$set": {
                "recurrence_status": status,
                "recurrence_issue": issue,
                "updated_at": datetime.now(UTC),
            }
        },
    )
    return {"ok": True}

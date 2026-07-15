from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.deps import get_current_user
from app.core.settings import settings
from app.payments.mercado_pago import GatewayError, verify_webhook_signature
from app.payments.registry import build_gateway_registry
from app.schemas.payment import CardSubscriptionIn, PaymentOut
from app.services.payments import apply_webhook, create_payment, token_hash

router = APIRouter(prefix="/payments", tags=["payments"])


class PaymentStatusOut(BaseModel):
    id: str
    status: str
    status_detail: str | None = None


def payment_out(doc: dict[str, Any], claim_token: str) -> PaymentOut:
    return PaymentOut(
        payment_id=str(doc["_id"]),
        payment_token=claim_token,
        gateway=doc.get("gateway", ""),
        external_id=doc.get("external_id"),
        status=doc["status"],
    )


@router.post("/card-subscription", response_model=PaymentOut)
async def card_subscription(data: CardSubscriptionIn, req: Request, user=Depends(get_current_user)):
    try:
        doc, claim_token = await create_payment(
            req.app.state.db,
            build_gateway_registry(),
            plan_slug=data.plan_slug,
            mode=data.payment_mode,
            payer_email=str(data.payer_email),
            card_token=data.card_token_id,
            payment_method_id=data.payment_method_id,
            account_email=user["email"],
            preferred_gateway=data.gateway,
        )
    except GatewayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return payment_out(doc, claim_token)


@router.post("/me/renewals/{submission_id}", response_model=PaymentOut)
async def renewal_payment(
    submission_id: str,
    data: CardSubscriptionIn,
    req: Request,
    user=Depends(get_current_user),
):
    if not ObjectId.is_valid(submission_id):
        raise HTTPException(status_code=400, detail="ID inválido")
    submission = await req.app.state.db.consultancy_submissions.find_one({"_id": ObjectId(submission_id)})
    if not submission:
        raise HTTPException(status_code=404, detail="Contrato não encontrado")
    if submission.get("customer", {}).get("email", "").lower() != user["email"].lower():
        raise HTTPException(status_code=403, detail="Sem permissão para renovar este contrato")
    try:
        doc, claim_token = await create_payment(
            req.app.state.db,
            build_gateway_registry(),
            plan_slug=data.plan_slug,
            mode=data.payment_mode,
            payer_email=str(data.payer_email),
            card_token=data.card_token_id,
            payment_method_id=data.payment_method_id,
            renewal_submission_id=submission_id,
            account_email=user["email"],
            preferred_gateway=data.gateway,
        )
    except GatewayError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return payment_out(doc, claim_token)


@router.get("/{payment_id}/status", response_model=PaymentStatusOut)
async def payment_status(payment_id: str, token: str, req: Request):
    if not ObjectId.is_valid(payment_id):
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    doc = await req.app.state.db.payments.find_one({"_id": ObjectId(payment_id), "claim_token_hash": token_hash(token)})
    if not doc:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    return PaymentStatusOut(id=payment_id, status=doc["status"], status_detail=doc.get("status_detail"))


@router.post("/webhooks/{gateway_name}")
async def payment_webhook(gateway_name: str, req: Request):
    payload = await req.json()
    if gateway_name == "mercado_pago":
        data_id = str(req.query_params.get("data.id") or payload.get("data", {}).get("id") or "")
        if not verify_webhook_signature(
            signature=req.headers.get("x-signature", ""),
            request_id=req.headers.get("x-request-id", ""),
            data_id=data_id,
            secret=settings.mercado_pago_webhook_secret,
        ):
            raise HTTPException(status_code=401, detail="Assinatura do webhook inválida")
    try:
        processed = await apply_webhook(req.app.state.db, build_gateway_registry(), gateway_name, payload)
    except (GatewayError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "processed": processed}


@router.post("/webhook/mercado-pago", include_in_schema=False)
async def legacy_mercado_pago_webhook(req: Request):
    return await payment_webhook("mercado_pago", req)

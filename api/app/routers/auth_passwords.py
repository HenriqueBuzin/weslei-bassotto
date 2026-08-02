import asyncio
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

from app.core.security import hash_password
from app.core.settings import settings
from app.db import get_db
from app.db.contracts import ReturnDocument
from app.schemas.auth import ForgotPasswordIn, ForgotPasswordOut, ResetPasswordIn
from app.services.auth_sessions import revoke_user_sessions
from app.services.email import send_reset_email, smtp_configured

router = APIRouter()


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _reset_url(token: str) -> str:
    return f"{settings.frontend_public_url.rstrip('/')}/redefinir-senha?token={token}"


@router.post("/forgot-password", response_model=ForgotPasswordOut)
async def forgot_password(req: Request, data: ForgotPasswordIn):
    db = get_db(req)
    email = data.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        return ForgotPasswordOut()

    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=settings.password_reset_expires_minutes)
    await db.password_reset_tokens.update_many(
        {"user_id": user["_id"], "used_at": None},
        {"$set": {"used_at": now}},
    )
    await db.password_reset_tokens.insert_one(
        {
            "user_id": user["_id"],
            "token_hash": token_hash(token),
            "created_at": now,
            "expires_at": expires_at,
            "used_at": None,
        }
    )

    reset_url = _reset_url(token)
    if not smtp_configured():
        return ForgotPasswordOut(ok=True, email_sent=False, reset_url=reset_url if settings.is_dev else None)

    await asyncio.to_thread(send_reset_email, email, reset_url)
    return ForgotPasswordOut(ok=True, email_sent=True, reset_url=reset_url if settings.is_dev else None)


@router.post("/reset-password")
async def reset_password(req: Request, data: ResetPasswordIn):
    db = get_db(req)
    now = datetime.now(UTC)
    token_doc = await db.password_reset_tokens.find_one_and_update(
        {
            "token_hash": token_hash(data.token),
            "used_at": None,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not token_doc:
        raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado")

    update_result = await db.users.update_one(
        {"_id": token_doc["user_id"]},
        {"$set": {"password_hash": hash_password(data.password)}},
    )
    if update_result.matched_count != 1:
        raise HTTPException(status_code=400, detail="Link inválido, expirado ou já utilizado")

    await revoke_user_sessions(db, token_doc["user_id"], "password_reset")
    await db.password_reset_tokens.update_many(
        {"user_id": token_doc["user_id"], "used_at": None},
        {"$set": {"used_at": now}},
    )
    return {"ok": True}

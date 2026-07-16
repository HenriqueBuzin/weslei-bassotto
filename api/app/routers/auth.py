# app/routers/auth.py

import asyncio
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from pymongo import ReturnDocument

from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.core.settings import settings
from app.db.mongo import get_db
from app.schemas.auth import ForgotPasswordIn, ForgotPasswordOut, ResetPasswordIn, TokenOut
from app.schemas.user import UserCreate, UserOut
from app.services.auth_sessions import (
    issue_refresh_session,
    refresh_identity,
    revoke_refresh_session,
    revoke_user_sessions,
    rotate_refresh_session,
)
from app.services.email import send_reset_email, smtp_configured

router = APIRouter(prefix="/auth", tags=["auth"])


# ===== Helpers =====
def set_refresh_cookie(response: Response, token: str, *, max_age: int | None) -> None:
    """
    Seta o refresh token em cookie HttpOnly.
    - max_age=None => cookie de sessão (não persiste após fechar o navegador)
    - max_age=int  => cookie persistente (Max-Age em segundos)
    """
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=bool(settings.cookie_secure),
        samesite=settings.cookie_samesite,  # normalizado
        max_age=max_age,  # <- agora vem de fora
        path=settings.refresh_cookie_path,
        domain=settings.cookie_domain or None,
    )


def clear_refresh_cookie(response: Response) -> None:
    """Apaga o cookie de refresh."""
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        domain=settings.cookie_domain or None,
    )


def _require_xhr_if_none_samesite(request: Request) -> None:
    """
    Se usando SameSite=None (dev cross-site), exigimos um header que <form> não envia,
    reduzindo CSRF básico em ambientes de desenvolvimento.
    """
    if settings.cookie_samesite == "none":
        if request.headers.get("x-requested-with") != "XMLHttpRequest":
            raise HTTPException(status_code=400, detail="CSRF check falhou")


def _user_out(doc) -> UserOut:
    return UserOut(id=str(doc["_id"]), email=doc["email"], roles=doc.get("roles", []))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _reset_url(token: str) -> str:
    return f"{settings.frontend_public_url.rstrip('/')}/redefinir-senha?token={token}"


# ===== Endpoints =====
@router.post("/login", response_model=TokenOut)
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    remember: bool = Form(False),  # <- NOVO: vem do x-www-form-urlencoded
):
    db = get_db(request)
    email = form.username.strip().lower()
    login_now = datetime.now(UTC)
    security = await db.login_security.find_one({"email": email})
    locked_until = _as_utc(security.get("locked_until")) if security else None
    if locked_until and locked_until > login_now:
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns minutos e tente novamente")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(form.password, user["password_hash"]):
        window = timedelta(minutes=settings.login_attempt_window_minutes)
        started_at = _as_utc(security.get("started_at")) if security else None
        attempts = (security.get("attempts", 0) + 1) if started_at and started_at > login_now - window else 1
        locked_until = (
            login_now + timedelta(minutes=settings.login_lock_minutes)
            if attempts >= settings.login_max_attempts
            else None
        )
        await db.login_security.update_one(
            {"email": email},
            {
                "$set": {
                    "attempts": attempts,
                    "started_at": started_at if attempts > 1 else login_now,
                    "locked_until": locked_until,
                    "expires_at": login_now + window + timedelta(minutes=settings.login_lock_minutes),
                }
            },
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    await db.login_security.delete_one({"email": email})
    sub = str(user["_id"])
    access = create_access_token(sub, user.get("roles", []))

    # expiração do refresh conforme "lembrar de mim"
    rt_expires = settings.REFRESH_TOKEN_EXPIRES_LONG if remember else settings.REFRESH_TOKEN_EXPIRES_SHORT

    # IMPORTANTE: inclua um claim para sabermos depois se era "remember"
    # Ex.: rm = 1 (persistente) ou 0 (sessão)
    refresh = await issue_refresh_session(db, user["_id"], rt_expires, remember)

    # Cookie: persistente quando remember=true; sessão quando remember=false
    max_age = int(rt_expires.total_seconds()) if remember else None
    set_refresh_cookie(response, refresh, max_age=max_age)
    return {"access_token": access}


@router.post("/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response):
    _require_xhr_if_none_samesite(request)

    rt = request.cookies.get(settings.refresh_cookie_name)
    if not rt:
        raise HTTPException(status_code=401, detail="Sem refresh token")

    try:
        payload = decode_token(rt)
    except JWTError:
        raise HTTPException(status_code=401, detail="Refresh inválido")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Use refresh token")

    identity = refresh_identity(payload)
    if not identity:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh inválido")

    remember = bool(payload.get("rm", 0))

    db = get_db(request)
    user = await db.users.find_one({"_id": identity[0]})
    if not user:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    access = create_access_token(str(user["_id"]), user.get("roles", []))

    rt_expires = settings.REFRESH_TOKEN_EXPIRES_LONG if remember else settings.REFRESH_TOKEN_EXPIRES_SHORT
    new_rt = await rotate_refresh_session(db, payload, rt_expires)
    if not new_rt:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=401, detail="Refresh expirado, revogado ou reutilizado")

    # Cookie: persistente se remember, sessão se não
    max_age = int(rt_expires.total_seconds()) if remember else None
    set_refresh_cookie(response, new_rt, max_age=max_age)

    return {"access_token": access}


@router.post("/logout", status_code=204)
async def logout(response: Response, request: Request):
    _require_xhr_if_none_samesite(request)
    token = request.cookies.get(settings.refresh_cookie_name)
    if token:
        try:
            payload = decode_token(token)
            if payload.get("type") == "refresh":
                await revoke_refresh_session(get_db(request), payload)
        except JWTError:
            pass
    clear_refresh_cookie(response)


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
            "token_hash": _token_hash(token),
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
            "token_hash": _token_hash(data.token),
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


@router.post("/register", response_model=UserOut, status_code=201)
async def register(req: Request, data: UserCreate):
    db = get_db(req)

    email = data.email.strip().lower()
    exists = await db.users.find_one({"email": email})
    if exists:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    doc = {
        "email": email,
        "password_hash": hash_password(data.password),
        "roles": ["user"],
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _user_out(doc)

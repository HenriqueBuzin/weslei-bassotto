# app/routers/auth.py

from bson import ObjectId
from jose import JWTError
from fastapi import APIRouter, HTTPException, status, Request, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.db.mongo import get_db
from app.core.settings import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.schemas.user import UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# ===== Helpers =====
def set_refresh_cookie(response: Response, token: str) -> None:
    """Seta o refresh token em cookie HttpOnly."""
    max_age = int(settings.REFRESH_TOKEN_EXPIRES.total_seconds())
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=bool(settings.cookie_secure),
        samesite=settings.cookie_samesite,  # já vem normalizado (lower)
        max_age=max_age,
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

# ===== Schemas =====
class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ===== Endpoints =====
@router.post("/login", response_model=TokenOut)
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
):
    db = get_db(request)
    email = form.username.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    sub = str(user["_id"])
    access = create_access_token(sub, user.get("roles", []))
    refresh = create_refresh_token(sub)
    set_refresh_cookie(response, refresh)
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

    db = get_db(request)
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    access = create_access_token(str(user["_id"]), user.get("roles", []))
    # Rotação do refresh (opcional, mas recomendado)
    new_rt = create_refresh_token(str(user["_id"]))
    set_refresh_cookie(response, new_rt)
    return {"access_token": access}

@router.post("/logout", status_code=204)
async def logout(response: Response, request: Request):
    _require_xhr_if_none_samesite(request)
    clear_refresh_cookie(response)

@router.post("/register", response_model=UserOut, status_code=201)
async def register(req: Request, data: UserCreate):
    db = get_db(req)
    await db.users.create_index("email", unique=True)

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

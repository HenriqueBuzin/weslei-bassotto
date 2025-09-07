# app/routers/auth.py

from bson import ObjectId
from jose import JWTError
from fastapi import APIRouter, HTTPException, status, Request, Depends, Response, Form
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
        max_age=max_age,                    # <- agora vem de fora
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
    remember: bool = Form(False),  # <- NOVO: vem do x-www-form-urlencoded
):
    db = get_db(request)
    email = form.username.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    sub = str(user["_id"])
    access = create_access_token(sub, user.get("roles", []))

    # expiração do refresh conforme "lembrar de mim"
    rt_expires = (
        settings.REFRESH_TOKEN_EXPIRES_LONG
        if remember
        else settings.REFRESH_TOKEN_EXPIRES_SHORT
    )

    # IMPORTANTE: inclua um claim para sabermos depois se era "remember"
    # Ex.: rm = 1 (persistente) ou 0 (sessão)
    refresh = create_refresh_token(sub, expires_delta=rt_expires, claims={"rm": 1 if remember else 0})

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

    # Descobre se o refresh original era "remember" pelos claims (rm=1/0)
    remember = bool(payload.get("rm", 0))

    db = get_db(request)
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")

    access = create_access_token(str(user["_id"]), user.get("roles", []))

    # Rotaciona o refresh preservando a política remember
    rt_expires = (
        settings.REFRESH_TOKEN_EXPIRES_LONG
        if remember
        else settings.REFRESH_TOKEN_EXPIRES_SHORT
    )
    new_rt = create_refresh_token(str(user["_id"]), expires_delta=rt_expires, claims={"rm": 1 if remember else 0})

    # Cookie: persistente se remember, sessão se não
    max_age = int(rt_expires.total_seconds()) if remember else None
    set_refresh_cookie(response, new_rt, max_age=max_age)

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

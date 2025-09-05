# app/routers/auth.py

from fastapi import APIRouter, HTTPException, status, Request, Depends
from fastapi.security import OAuth2PasswordRequestForm
from bson import ObjectId
from jose import JWTError
from app.schemas.user import UserCreate, UserOut, TokenPair, RefreshIn
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token
)
from app.db.mongo import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

def _user_out(doc) -> UserOut:
    return UserOut(id=str(doc["_id"]), email=doc["email"], roles=doc.get("roles", []))

@router.post("/register", response_model=UserOut, status_code=201)
async def register(req: Request, data: UserCreate):
    db = get_db(req)
    email = data.email.strip().lower()                 # <-- normaliza
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

@router.post("/login", response_model=TokenPair)
async def login(req: Request, form: OAuth2PasswordRequestForm = Depends()):
    db = get_db(req)
    email = form.username.strip().lower()              # <-- normaliza
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Bearer"},    # <-- bom p/ Swagger
        )
    sub = str(user["_id"])
    access = create_access_token(sub, roles=user.get("roles", []))
    refresh = create_refresh_token(sub)
    return TokenPair(access_token=access, refresh_token=refresh)

@router.post("/refresh", response_model=TokenPair)
async def refresh(req: Request, body: RefreshIn):
    try:
        payload = decode_token(body.refresh_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não é refresh",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem sub",
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = get_db(req)
    try:
        user = await db.users.find_one({"_id": ObjectId(sub)})
    except Exception:
        user = None
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access = create_access_token(sub, roles=user.get("roles", []))
    new_refresh = create_refresh_token(sub)  # opcional: rotacionar
    return TokenPair(access_token=access, refresh_token=new_refresh)

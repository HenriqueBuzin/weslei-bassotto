# app/core/deps.py

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from bson import ObjectId
from app.core.settings import settings
from app.core.security import decode_token
from app.db.mongo import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_base}/auth/login")

async def get_current_user(request: Request, token: str = Depends(oauth2_scheme)):
    db = get_db(request)
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Use um access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem sub",
            headers={"WWW-Authenticate": "Bearer"},
        )

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
    return user

def role_required(*allowed_roles: str):
    async def _dep(user = Depends(get_current_user)):
        roles = set(user.get("roles", []))
        if not roles.intersection(set(allowed_roles)):
            raise HTTPException(status_code=403, detail="Sem permissão")
        return user
    return _dep

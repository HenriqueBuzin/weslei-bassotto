# app/core/security.py

from jose import jwt
from app.core.settings import settings
from datetime import datetime, timezone
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta

pwd_ctx = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(p: str) -> str:
    return pwd_ctx.hash(p)

def verify_password(p: str, hashed: str) -> bool:
    return pwd_ctx.verify(p, hashed)

def _encode(payload: dict, expires_delta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    to_encode = {
        **payload,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_alg)

def create_access_token(sub: str, roles: list[str]) -> str:
    return _encode({"sub": sub, "roles": roles}, settings.ACCESS_TOKEN_EXPIRES, "access")

# app/core/security.py (exemplo de assinatura)
def create_refresh_token(sub: str, expires_delta: timedelta, claims: dict | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "type": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])

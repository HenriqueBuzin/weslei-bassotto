# app/routers/me.py

from fastapi import APIRouter, Depends
from app.core.deps import get_current_user
from app.schemas.user import UserOut

router = APIRouter(prefix="/me", tags=["me"])

@router.get("", response_model=UserOut)
async def me(user = Depends(get_current_user)):
    return UserOut(id=str(user["_id"]), email=user["email"], roles=user.get("roles", []))

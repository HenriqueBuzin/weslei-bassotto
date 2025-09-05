# app/routers/admin.py

from fastapi import APIRouter, Depends
from app.core.deps import role_required

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/secret")
async def secret(_user = Depends(role_required("admin"))):
    return {"ok": True, "msg": "conteúdo apenas para admin"}

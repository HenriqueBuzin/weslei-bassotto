# app/routers/__init__.py

from .me import router as me_router
from .auth import router as auth_router
from .admin import router as admin_router

ROUTERS = (auth_router, me_router, admin_router)

__all__ = [
    "ROUTERS",
    "me_router",
    "auth_router",
    "admin_router"
]

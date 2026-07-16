# app/routers/__init__.py

from .admin import router as admin_router
from .auth import router as auth_router
from .consultancy import router as consultancy_router
from .me import router as me_router
from .payments import router as payments_router
from .plans import router as plans_router

ROUTERS = (auth_router, me_router, admin_router, consultancy_router, payments_router, plans_router)

__all__ = [
    "ROUTERS",
    "me_router",
    "auth_router",
    "admin_router",
    "consultancy_router",
    "payments_router",
    "plans_router",
]

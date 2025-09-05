# app/routers/__init__.py

from .auth import router as auth_router
from .me import router as me_router
from .admin import router as admin_router

# Coleção para iterar no main.py
ROUTERS = (auth_router, me_router, admin_router)

__all__ = ["auth_router", "me_router", "admin_router", "ROUTERS"]

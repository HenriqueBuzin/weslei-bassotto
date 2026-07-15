# app/db/__init__.py

from .indexes import ensure_all as ensure_indexes
from .mongo import connect, disconnect, get_db

__all__ = ["get_db", "connect", "disconnect", "ensure_indexes"]

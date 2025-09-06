# app/db/__init__.py

from .mongo import connect, disconnect, get_db
from .indexes import ensure_all as ensure_indexes

__all__ = [
    "get_db",
    "connect", 
    "disconnect", 
    "ensure_indexes"
]

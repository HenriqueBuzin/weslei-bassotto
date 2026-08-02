import re
import secrets
from enum import Enum


class DuplicateKeyError(Exception):
    """Raised when an application-level unique constraint is violated."""


class ReturnDocument(Enum):
    BEFORE = "before"
    AFTER = "after"


class RecordId(str):
    """Stable 24-character identifier used by API records."""

    _pattern = re.compile(r"^[0-9a-fA-F]{24}$")

    def __new__(cls, value: str | None = None):
        candidate = value or secrets.token_hex(12)
        if not cls.is_valid(candidate):
            raise ValueError("RecordId must contain 24 hexadecimal characters")
        return super().__new__(cls, str(candidate).lower())

    @classmethod
    def is_valid(cls, value: object) -> bool:
        return isinstance(value, (str, cls)) and bool(cls._pattern.fullmatch(str(value)))

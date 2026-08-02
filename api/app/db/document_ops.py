import copy
import json
import re
from datetime import date, datetime
from typing import Any

from app.db.contracts import RecordId


def to_json(value: dict[str, Any]) -> str:
    return json.dumps(value, default=_json_default, separators=(",", ":"))


def _json_default(value: Any) -> dict[str, str]:
    if isinstance(value, datetime):
        return {"$date": value.isoformat()}
    if isinstance(value, date):
        return {"$dateOnly": value.isoformat()}
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def restore_types(value: Any, key: str | None = None) -> Any:
    if isinstance(value, list):
        return [restore_types(item, key) for item in value]
    if isinstance(value, dict):
        if set(value) == {"$date"}:
            return datetime.fromisoformat(value["$date"].replace("Z", "+00:00"))
        if set(value) == {"$dateOnly"}:
            return date.fromisoformat(value["$dateOnly"])
        return {item_key: restore_types(item_value, item_key) for item_key, item_value in value.items()}
    if key == "_id" and RecordId.is_valid(value):
        return RecordId(value)
    return value


def copy_doc(doc: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(doc)


def get_path(doc: dict[str, Any], path: str) -> tuple[bool, Any]:
    current: Any = doc
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return False, None
        current = current[part]
    return True, current


def set_path(doc: dict[str, Any], path: str, value: Any) -> None:
    current = doc
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


def unset_path(doc: dict[str, Any], path: str) -> bool:
    current = doc
    parts = path.split(".")
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return False
        current = current[part]
    if not isinstance(current, dict) or parts[-1] not in current:
        return False
    del current[parts[-1]]
    return True


def matches(doc: dict[str, Any], query: dict[str, Any] | None) -> bool:
    for key, expected in (query or {}).items():
        actual_exists, actual = get_path(doc, key)
        if not _matches_value(actual_exists, actual, expected):
            return False
    return True


def _matches_value(actual_exists: bool, actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict):
        for operator, operand in expected.items():
            if operator == "$exists":
                if actual_exists != bool(operand):
                    return False
            elif operator == "$gt":
                if not actual_exists or actual <= operand:
                    return False
            elif operator == "$regex":
                if not actual_exists or re.search(str(operand), str(actual)) is None:
                    return False
            else:
                raise NotImplementedError(f"Unsupported query operator: {operator}")
        return True
    if actual_exists and isinstance(actual, list) and not isinstance(expected, list):
        return expected in actual
    return actual_exists and actual == expected


def query_seed(query: dict[str, Any]) -> dict[str, Any]:
    doc: dict[str, Any] = {}
    for key, value in query.items():
        if not isinstance(value, dict):
            set_path(doc, key, value)
    return doc


def apply_update(doc: dict[str, Any], update: dict[str, Any], *, inserting: bool = False) -> bool:
    changed = False
    for key, value in update.get("$set", {}).items():
        set_path(doc, key, value)
        changed = True
    if inserting:
        for key, value in update.get("$setOnInsert", {}).items():
            set_path(doc, key, value)
            changed = True
    for key, value in update.get("$push", {}).items():
        exists, current = get_path(doc, key)
        if not exists or current is None:
            current = []
            set_path(doc, key, current)
        current.append(value)
        changed = True
    for key, value in update.get("$inc", {}).items():
        exists, current = get_path(doc, key)
        set_path(doc, key, (current if exists and current is not None else 0) + value)
        changed = True
    for key, value in update.get("$addToSet", {}).items():
        exists, current = get_path(doc, key)
        if not exists or current is None:
            current = []
            set_path(doc, key, current)
        if value not in current:
            current.append(value)
            changed = True
    for key in update.get("$unset", {}):
        changed = unset_path(doc, key) or changed
    return changed


def present(values: list[Any]) -> bool:
    return all(value is not None for value in values)

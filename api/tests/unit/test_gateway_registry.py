import pytest

from app.payments.registry import GatewayRegistry


class Gateway:
    def __init__(self, name):
        self.name = name


def test_registry_respects_preferred_gateway_without_duplicates():
    registry = GatewayRegistry([Gateway("first"), Gateway("second")], ["first", "second"])
    assert [item.name for item in registry.candidates("second")] == ["second", "first"]


def test_registry_rejects_unknown_gateway():
    registry = GatewayRegistry([], [])
    with pytest.raises(ValueError):
        registry.get("missing")

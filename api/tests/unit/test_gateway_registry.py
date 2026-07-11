import pytest

from app.payments.registry import GatewayRegistry, build_gateway_registry


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


def test_registry_filters_unknown_names_and_builds_default():
    registry = GatewayRegistry([Gateway("first")], ["missing", "first", "first"])
    assert [item.name for item in registry.candidates("unknown")] == ["first"]
    default = build_gateway_registry()
    assert default.get("mercado_pago").name == "mercado_pago"

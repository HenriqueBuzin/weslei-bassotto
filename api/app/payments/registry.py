from collections.abc import Iterable

from app.payments.contracts import PaymentGateway


class GatewayRegistry:
    def __init__(self, gateways: Iterable[PaymentGateway], order: list[str]):
        self._gateways = {gateway.name: gateway for gateway in gateways}
        self.order = order

    def get(self, name: str) -> PaymentGateway:
        try:
            return self._gateways[name]
        except KeyError as exc:
            raise ValueError(f"Gateway não configurado: {name}") from exc

    def candidates(self, preferred: str | None = None) -> list[PaymentGateway]:
        names = ([preferred] if preferred else []) + self.order
        unique = []
        for name in names:
            if name and name not in unique and name in self._gateways:
                unique.append(name)
        return [self._gateways[name] for name in unique]


def build_gateway_registry() -> GatewayRegistry:
    from app.core.settings import settings
    from app.payments.mercado_pago import MercadoPagoGateway

    gateway = MercadoPagoGateway(settings.mercado_pago_access_token, settings.app_public_url)
    return GatewayRegistry([gateway], settings.payment_gateway_order)

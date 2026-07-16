from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True, slots=True)
class Plan:
    slug: str
    name: str
    months: int
    cash_amount: Decimal
    subscription_total: Decimal
    monthly_amount: Decimal


PLANS = {
    "trimestral": Plan("trimestral", "Plano Trimestral", 3, Decimal("597.00"), Decimal("638.00"), Decimal("212.66")),
    "semestral": Plan("semestral", "Plano Semestral", 6, Decimal("997.00"), Decimal("1093.00"), Decimal("182.23")),
    "anual": Plan("anual", "Plano Anual", 12, Decimal("1597.00"), Decimal("1863.00"), Decimal("155.25")),
}


def get_plan(slug: str) -> Plan:
    return PLANS[slug]


def list_plans() -> list[Plan]:
    return list(PLANS.values())


def add_months(source: date, months: int) -> date:
    target = source.month - 1 + months
    year = source.year + target // 12
    month = target % 12 + 1
    return source.replace(year=year, month=month, day=min(source.day, monthrange(year, month)[1]))


def contract_period(months: int, *, today: date | None = None, current_end: date | None = None) -> tuple[date, date]:
    today = today or date.today()
    start = current_end if current_end and current_end > today else today
    return start, add_months(start, months)

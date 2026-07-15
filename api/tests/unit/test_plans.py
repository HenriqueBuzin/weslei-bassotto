from datetime import date
from decimal import Decimal

from app.domain.plans import add_months, contract_period, get_plan


def test_monthly_amount_uses_contract_total():
    assert get_plan("semestral").monthly_amount == Decimal("182.23")


def test_add_months_handles_last_day_and_leap_year():
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2025, 1, 31), 1) == date(2025, 2, 28)


def test_renewal_starts_after_active_contract():
    assert contract_period(3, today=date(2026, 5, 1), current_end=date(2026, 7, 1)) == (
        date(2026, 7, 1),
        date(2026, 10, 1),
    )

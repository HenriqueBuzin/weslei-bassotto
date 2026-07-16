from decimal import Decimal

from pydantic import BaseModel


class PlanOut(BaseModel):
    slug: str
    name: str
    months: int
    cash: Decimal
    subscription_total: Decimal
    monthly: Decimal

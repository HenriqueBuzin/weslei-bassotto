from fastapi import APIRouter

from app.domain.plans import list_plans
from app.schemas.plan import PlanOut

router = APIRouter(prefix="/plans", tags=["plans"])


@router.get("", response_model=list[PlanOut])
async def list_available_plans():
    return [
        PlanOut(
            slug=plan.slug,
            name=plan.name,
            months=plan.months,
            cash=plan.cash_amount,
            subscription_total=plan.subscription_total,
            monthly=plan.monthly_amount,
        )
        for plan in list_plans()
    ]

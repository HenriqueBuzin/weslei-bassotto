from typing import Literal

from pydantic import BaseModel, EmailStr

PlanSlug = Literal["trimestral", "semestral", "anual"]
PaymentMode = Literal["cash", "subscription"]


class CheckoutIn(BaseModel):
    plan_slug: PlanSlug
    payer_email: EmailStr


class CardSubscriptionIn(CheckoutIn):
    card_token_id: str
    payment_method_id: str | None = None
    payment_mode: PaymentMode = "subscription"


class RenewalCheckoutIn(CheckoutIn):
    submission_id: str


class CheckoutOut(BaseModel):
    preference_id: str
    checkout_url: str


class SubscriptionOut(BaseModel):
    preapproval_id: str
    status: str

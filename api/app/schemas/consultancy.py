from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field

QuestionType = Literal["text", "textarea", "number", "select", "boolean"]
PlanSlug = Literal["trimestral", "semestral", "anual"]
SubmissionStatus = Literal["pending_payment", "paid", "active", "finished", "cancelled"]


class QuestionIn(BaseModel):
    label: str = Field(min_length=3, max_length=220)
    type: QuestionType = "textarea"
    options: list[str] = []
    required: bool = True
    active: bool = True
    order: int = 0


class QuestionPatch(BaseModel):
    label: str | None = Field(default=None, min_length=3, max_length=220)
    type: QuestionType | None = None
    options: list[str] | None = None
    required: bool | None = None
    active: bool | None = None
    order: int | None = None


class QuestionOut(QuestionIn):
    id: str
    created_at: datetime
    updated_at: datetime


class CustomerIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=8, max_length=30)


class AnswerIn(BaseModel):
    question_id: str
    value: Any = None


class SubmissionIn(BaseModel):
    plan_slug: PlanSlug
    customer: CustomerIn
    answers: list[AnswerIn]
    payment_reference: str | None = None


class AnswersUpdateIn(BaseModel):
    answers: list[AnswerIn]


class RenewalIn(BaseModel):
    plan_slug: PlanSlug
    payment_reference: str | None = None


class SubscriptionPatch(BaseModel):
    status: SubmissionStatus | None = None
    start_date: date | None = None
    end_date: date | None = None
    payment_reference: str | None = None


class SubmissionOut(BaseModel):
    id: str
    customer: dict[str, Any]
    plan: dict[str, Any]
    status: SubmissionStatus
    payment_reference: str | None = None
    answers: list[dict[str, Any]]
    answers_changed_at: datetime | None = None
    answers_seen_at: datetime | None = None
    renewal_count: int = 0
    renewals: list[dict[str, Any]] = []
    created_at: datetime
    updated_at: datetime

from pydantic import BaseModel, EmailStr, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ForgotPasswordOut(BaseModel):
    ok: bool = True
    email_sent: bool = False
    reset_url: str | None = None


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=6)

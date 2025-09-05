# app/core/settings.py

from datetime import timedelta
from pydantic import Field, field_validator, computed_field, ValidationInfo, EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # --- Básicos ---
    api_base: str = Field(validation_alias="API_BASE")
    mongo_uri: str = Field(validation_alias="MONGO_URI")
    app_env: str = Field(validation_alias="APP_ENV")  # "dev" | "prod"

    # --- Auth/JWT ---
    jwt_alg: str = Field(validation_alias="JWT_ALG")  # HS256 | RS256 | ES256
    jwt_secret: str = Field(validation_alias="JWT_SECRET")
    access_token_expires_minutes: int = Field(validation_alias="ACCESS_TOKEN_EXPIRES_MINUTES")
    refresh_token_expires_days: int = Field(validation_alias="REFRESH_TOKEN_EXPIRES_DAYS")

    # --- CORS ---
    cors_allowed_origins: list[str] = Field(validation_alias="CORS_ALLOWED_ORIGINS")

    # --- Seeder / Admin inicial (opcionais) ---
    seed_on_start: bool = Field(default=False, validation_alias="SEED_ON_START")
    admin_email: EmailStr | None = Field(default=None, validation_alias="ADMIN_EMAIL")
    admin_password: str | None = Field(default=None, validation_alias="ADMIN_PASSWORD")

    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    # validadores já existentes …
    @field_validator("api_base", mode="before")
    @classmethod
    def _normalize_api_base(cls, v: str) -> str:
        s = str(v or "").strip()
        if not s.startswith("/"):
            s = "/" + s
        return s.rstrip("/") or "/"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v == "*":
                return ["*"]
            return [o.strip() for o in v.split(",") if o.strip()]
        return list(v or [])

    @field_validator("jwt_alg", mode="before")
    @classmethod
    def _upper_and_check_alg(cls, v: str) -> str:
        allowed = {"HS256", "RS256", "ES256"}
        alg = str(v or "").upper()
        if alg not in allowed:
            raise ValueError(f"JWT_ALG inválido. Use um de: {', '.join(sorted(allowed))}")
        return alg

    @field_validator("jwt_secret")
    @classmethod
    def _check_secret(cls, v: str, info: ValidationInfo) -> str:
        alg = str(info.data.get("jwt_alg", "")).upper()
        secret = str(v or "")
        if alg.startswith("HS"):
            if len(secret) < 32:
                raise ValueError("JWT_SECRET muito curto para HS*. Use 32+ caracteres.")
        else:
            if not secret:
                raise ValueError("JWT_SECRET não pode ser vazio (mesmo com RS/ES).")
        return secret

    @field_validator("app_env", mode="before")
    @classmethod
    def _lower_env(cls, v: str) -> str:
        return str(v or "").strip().lower()

    @field_validator("app_env")
    @classmethod
    def _check_env(cls, v: str) -> str:
        if v not in {"dev", "prod"}:
            raise ValueError("APP_ENV deve ser 'dev' ou 'prod'")
        return v

    # derivados
    @computed_field
    @property
    def ACCESS_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(minutes=self.access_token_expires_minutes)

    @computed_field
    @property
    def REFRESH_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(days=self.refresh_token_expires_days)

    @computed_field
    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    @computed_field
    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"

settings = Settings()

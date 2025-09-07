# app/core/settings.py

from datetime import timedelta
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import (
    Field,
    field_validator,
    computed_field,
    ValidationInfo,
    EmailStr,
    model_validator,
)
import json
import re


class Settings(BaseSettings):
    # --- Básicos ---
    api_base: str = Field(validation_alias="API_BASE")
    mongo_uri: str = Field(validation_alias="MONGO_URI")
    app_env: str = Field(validation_alias="APP_ENV")  # "dev" | "prod"

    # --- Auth/JWT ---
    jwt_alg: str = Field(validation_alias="JWT_ALG")  # HS256 | RS256 | ES256
    jwt_secret: str = Field(validation_alias="JWT_SECRET")
    access_token_expires_minutes: int = Field(validation_alias="ACCESS_TOKEN_EXPIRES_MINUTES")

    # --- Refresh curto/long (sem legado) ---
    refresh_token_expires_short_hours: int = Field(validation_alias="REFRESH_TOKEN_EXPIRES_SHORT_HOURS")
    refresh_token_expires_long_days: int = Field(validation_alias="REFRESH_TOKEN_EXPIRES_LONG_DAYS")

    # --- CORS ---
    cors_allowed_origins: list[str] = Field(validation_alias="CORS_ALLOWED_ORIGINS")

    # --- Seeder / Admin inicial (opcionais) ---
    seed_on_start: bool = Field(validation_alias="SEED_ON_START")
    admin_email: EmailStr | None = Field(validation_alias="ADMIN_EMAIL")
    admin_password: str | None = Field(validation_alias="ADMIN_PASSWORD")

    # --- Cookies (refresh em HttpOnly) ---
    cookie_domain: str | None = Field(validation_alias="COOKIE_DOMAIN")
    cookie_secure: bool = Field(validation_alias="COOKIE_SECURE")
    cookie_samesite: str = Field(validation_alias="COOKIE_SAMESITE")  # "lax" | "none" | "strict"
    refresh_cookie_name: str = Field(validation_alias="REFRESH_COOKIE_NAME")
    refresh_cookie_path: str = Field(validation_alias="REFRESH_COOKIE_PATH")

    model_config = SettingsConfigDict(env_file=None, case_sensitive=False, extra="ignore")

    # ---------- Validadores ----------
    @field_validator("api_base", mode="before")
    @classmethod
    def _normalize_api_base(cls, v: str) -> str:
        s = str(v or "").strip()
        if not s.startswith("/"):
            s = "/" + s
        return s.rstrip("/") or "/"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _split_or_parse_origins(cls, v):
        """
        Aceita:
          - lista real (['http://...'])
          - string JSON ('["http://...","http://..."]')
          - string separada por vírgula ('http://..., http://...')
          - '*' (cuidado)
        """
        if isinstance(v, list):
            return v
        s = str(v or "").strip()
        if not s:
            return []
        if s == "*":
            return ["*"]
        if s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed]
            except Exception:
                pass
        return [o.strip() for o in s.split(",") if o.strip()]

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

    @field_validator("cookie_samesite", mode="before")
    @classmethod
    def _norm_samesite(cls, v: str) -> str:
        s = str(v or "").strip().lower()
        if s not in {"lax", "none", "strict"}:
            raise ValueError("COOKIE_SAMESITE deve ser 'lax', 'none' ou 'strict'")
        return s

    @field_validator("refresh_cookie_name")
    @classmethod
    def _check_cookie_name(cls, v: str) -> str:
        s = str(v or "").strip()
        if not s or not re.fullmatch(r"[A-Za-z0-9_\-]+", s):
            raise ValueError("REFRESH_COOKIE_NAME inválido (use letras/números/_-)")
        return s

    @field_validator("refresh_cookie_path", mode="before")
    @classmethod
    def _norm_cookie_path(cls, v: str) -> str:
        s = str(v or "").strip() or "/"
        if not s.startswith("/"):
            s = "/" + s
        return s

    @field_validator("cookie_domain", mode="before")
    @classmethod
    def _empty_domain_to_none(cls, v: str | None) -> str | None:
        s = (v or "").strip()
        return s or None

    @model_validator(mode="after")
    def _check_cookie_combo(self):
        # Navegadores exigem Secure=true quando SameSite=None
        if self.cookie_samesite == "none" and not self.cookie_secure:
            # Em dev, prefira SameSite=lax. Em prod com cross-site, use Secure=true.
            raise ValueError(
                "COOKIE_SAMESITE=None exige COOKIE_SECURE=true. "
                "Use COOKIE_SAMESITE=lax em dev ou habilite HTTPS + Secure."
            )
        return self

    # ---------- Derivados ----------
    @computed_field
    @property
    def ACCESS_TOKEN_EXPIRES(self) -> timedelta:
        return timedelta(minutes=self.access_token_expires_minutes)

    @computed_field
    @property
    def REFRESH_TOKEN_EXPIRES_SHORT(self) -> timedelta:
        return timedelta(hours=self.refresh_token_expires_short_hours)

    @computed_field
    @property
    def REFRESH_TOKEN_EXPIRES_LONG(self) -> timedelta:
        return timedelta(days=self.refresh_token_expires_long_days)

    # Alias de compatibilidade (se algo ainda ler REFRESH_TOKEN_EXPIRES)
    @computed_field
    @property
    def REFRESH_TOKEN_EXPIRES(self) -> timedelta:
        return self.REFRESH_TOKEN_EXPIRES_LONG

    @computed_field
    @property
    def is_dev(self) -> bool:
        return self.app_env == "dev"

    @computed_field
    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"


settings = Settings()

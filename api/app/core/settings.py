# app/core/settings.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # sem defaults => obriga vir do ambiente; falha cedo se faltar
    api_base: str = Field(validation_alias="API_BASE")
    mongo_uri: str = Field(validation_alias="MONGO_URI")
    app_env: str = Field(validation_alias="APP_ENV")

    # somente env; sem .env; case-insensitive pros nomes
    model_config = SettingsConfigDict(
        env_file=None,          # NÃO lê .env aqui
        case_sensitive=False,   # API_BASE == api_base
        extra="ignore",         # ignore outras vars
    )

settings = Settings()

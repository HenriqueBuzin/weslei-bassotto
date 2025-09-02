from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_base: str = "/api/v1"
    mongo_uri: str = "mongodb://localhost:27017/myapp"
    app_env: str = "dev"

    class Config:
        env_file = ".env"  # útil fora do Docker; dentro, variáveis já vêm do env
        case_sensitive = False

settings = Settings()

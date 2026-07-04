"""Application settings loaded from environment variables (prefix: OCSRC_).

Secrets must never be committed; provide them via environment or an
untracked .env file (see infra/.env.example).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OCSRC_",
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "Open Civil Site Risk Checker API"
    app_env: str = "development"
    # Plain PostgreSQL DSN, e.g. postgresql://app:***@db:5432/site_risk_checker
    database_url: str | None = None
    db_check_timeout_seconds: float = 3.0


@lru_cache
def get_settings() -> Settings:
    return Settings()

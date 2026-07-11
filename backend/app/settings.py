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
    # Comma-separated allowlist of browser origins for CORS, e.g.
    # "http://localhost:5173". Empty (default) disables CORS entirely;
    # production stays same-origin behind the reverse proxy (Issue #35).
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        """cors_origins parsed into origins.

        Each entry is whitespace-stripped and has a trailing slash removed so
        that a configured "http://localhost:5173/" still matches the browser
        Origin header (which never carries a path); empty entries are dropped.
        """
        normalized = (
            origin.strip().rstrip("/") for origin in self.cors_origins.split(",")
        )
        return [origin for origin in normalized if origin]


@lru_cache
def get_settings() -> Settings:
    return Settings()

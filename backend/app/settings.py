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
    # Neon の serverless cold start（autosuspend 後の復帰は 8 秒を超えることがある）を
    # 許容する値に設定。watchdog 側は連続失敗判定で一時的な cold start を吸収する
    # （外部評価 Phase 0 / Issue #238 再発防止）。
    db_check_timeout_seconds: float = 20.0
    # Comma-separated allowlist of browser origins for CORS, e.g.
    # "http://localhost:5173". Empty (default) disables CORS entirely;
    # production stays same-origin behind the reverse proxy (Issue #35).
    cors_origins: str = ""

    # Nominatim geocoding proxy (Issue #84): the backend calls Nominatim
    # server-to-server so the browser never needs CORS from
    # nominatim.openstreetmap.org, and the 1 req/sec usage policy
    # (https://operations.osmfoundation.org/policies/nominatim/) is enforced
    # once per process instead of per browser tab.
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = (
        "OpenCivilSiteRiskChecker/0.2 "
        "(+https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker)"
    )
    nominatim_min_interval_seconds: float = 1.0
    nominatim_timeout_seconds: float = 8.0

    # AI 調査メモ（Anthropic）のサーバー側ブローカー設定。
    # キーはサーバー環境変数のみで保持し、ブラウザへ配布・保存しない（外部評価 Phase 0）。
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"
    anthropic_timeout_seconds: float = 90.0
    anthropic_max_prompt_chars: int = 20_000
    # AI 利用量制御（コストのある外部 API 呼び出しの踏み台・乱用を防ぐ）。
    anthropic_rate_limit_per_window: int = 10
    anthropic_rate_limit_window_seconds: float = 60.0
    anthropic_max_concurrency: int = 2

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

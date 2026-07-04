"""FastAPI application factory for the OCSRC backend (Phase 2 scaffold).

Endpoints:
  GET /healthz      — liveness + database reachability
  GET /api/v1/ping  — API smoke endpoint
"""

from typing import Annotated

from fastapi import Depends, FastAPI

from .db import check_database
from .settings import Settings, get_settings

API_VERSION = "0.1.0"


def create_app() -> FastAPI:
    app = FastAPI(title="Open Civil Site Risk Checker API", version=API_VERSION)

    @app.get("/healthz")
    async def healthz(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        if settings.database_url is None:
            db_status = "not_configured"
        else:
            db_status = await check_database(
                settings.database_url, timeout=settings.db_check_timeout_seconds
            )
        return {"status": "ok", "db": db_status, "version": API_VERSION}

    @app.get("/api/v1/ping")
    async def ping(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        return {"ping": "pong", "env": settings.app_env}

    return app


app = create_app()

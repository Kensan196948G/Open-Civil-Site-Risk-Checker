"""FastAPI application factory for the OCSRC backend (Phase 2).

Endpoints:
  GET /healthz        — liveness + database reachability
  GET /api/v1/ping    — API smoke endpoint
  GET /api/v1/nearby  — spatial search over the local KSJ store (PostGIS)
"""

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query

from .db import check_database, close_pools, get_pool
from .ksj import query_nearby
from .settings import Settings, get_settings

API_VERSION = "0.2.0"


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await close_pools()

    app = FastAPI(title="Open Civil Site Risk Checker API", version=API_VERSION, lifespan=lifespan)

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

    @app.get("/api/v1/nearby")
    async def nearby(
        settings: Annotated[Settings, Depends(get_settings)],
        lat: Annotated[float, Query(ge=-90.0, le=90.0)],
        lon: Annotated[float, Query(ge=-180.0, le=180.0)],
        radius_m: Annotated[int, Query(ge=1, le=10_000)] = 1000,
    ) -> dict:
        """Nearby KSJ features (rivers / facilities) within radius_m meters.

        Returns 503 (not an empty result) when the store is unreachable, so
        callers can honestly distinguish 'no data' from 'fetch failed'
        (FR-304 / NFR-504).
        """
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                items = await query_nearby(conn, lat=lat, lon=lon, radius_m=float(radius_m))
        except HTTPException:
            raise
        except Exception as exc:  # driver missing, connection refused, bad schema
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        return {
            "status": "ok",
            "count": len(items),
            "items": items,
            "meta": {"lat": lat, "lon": lon, "radius_m": radius_m},
        }

    return app


app = create_app()

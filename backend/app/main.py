"""FastAPI application factory for the OCSRC backend (Phase 2).

Endpoints:
  GET /livez                 — liveness (process only)
  GET /readyz                — readiness (database reachability, 503 when not ready)
  GET /healthz               — legacy alias of /readyz
  GET /api/v1/ping           — API smoke endpoint
  GET /api/v1/nearby         — spatial search over the local KSJ store (PostGIS)
  GET /api/v1/geocode        — Nominatim /search proxy (Issue #84)
  GET /api/v1/reverse-geocode — Nominatim /reverse proxy (Issue #84)
  GET /api/v1/ai/status      — server-side AI configuration status (no secrets)
  POST /api/v1/ai/memo       — AI memo broker (Anthropic key stays server-side)
"""

import asyncio
import json
import logging
import time
from collections import deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .ai import (
    AiMemoRequest,
    AiUpstreamError,
    call_anthropic,
    ensure_disclaimer,
    find_forbidden_expressions,
)
from .db import check_database, close_pools, get_pool
from .geocode import GeocodeUnavailableError
from .geocode import reverse as geocode_reverse
from .geocode import search as geocode_search
from .ksj import query_nearby
from .settings import Settings, get_settings

API_VERSION = "0.2.0"
logger = logging.getLogger("ocsrc.api")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI app.

    settings lets tests inject a fully controlled configuration; by default
    the environment-driven singleton is used. CORS is an explicit opt-in via
    OCSRC_CORS_ORIGINS (dev-only convenience, e.g. vite on localhost:5173);
    production stays same-origin behind the reverse proxy, so no origins are
    allowed unless configured. Wildcards are rejected at startup.
    """
    cfg = settings if settings is not None else get_settings()
    # AI ブローカーの利用量制御（プロセス内・単純な固定窓 + 同時実行上限）。
    ai_semaphore = asyncio.Semaphore(cfg.anthropic_max_concurrency)
    ai_call_times: deque[float] = deque()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        await close_pools()

    app = FastAPI(title="Open Civil Site Risk Checker API", version=API_VERSION, lifespan=lifespan)
    # テストや監視から現在の上限状態を確認できるようにする（利用量制御の検証用）。
    app.state.ai_semaphore = ai_semaphore
    app.state.ai_call_times = ai_call_times

    cors_origins = cfg.cors_origin_list
    if cors_origins:
        if any("*" in origin for origin in cors_origins):
            raise ValueError(
                "OCSRC_CORS_ORIGINS must be a comma-separated list of explicit "
                f"origins; wildcard '*' is not allowed: {cfg.cors_origins!r}"
            )
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            # The public API is read-only today; widen deliberately if that changes.
            allow_methods=["GET"],
            allow_credentials=False,
        )

    @app.get("/livez")
    async def livez(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        """Liveness: the process is up and can serve requests (no DB dependency)."""
        return {"status": "ok", "version": API_VERSION, "env": settings.app_env}

    @app.get("/readyz")
    async def readyz(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        """Readiness: DB reachability included. Returns 503 when not ready.

        Splitting liveness from readiness lets monitors distinguish a dead
        process from a backend whose database is temporarily unavailable
        (external evaluation Phase 0).
        """
        db_status, db_ms, db_error = await _db_status(settings)
        if db_status != "ok":
            logger.warning("readiness: db=%s error=%s check_ms=%s", db_status, db_error, db_ms)
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "error",
                    "db": db_status,
                    "db_error": db_error,
                    "db_check_ms": db_ms,
                    "version": API_VERSION,
                },
            )
        return {"status": "ok", "db": db_status, "db_check_ms": db_ms, "version": API_VERSION}

    @app.get("/healthz")
    async def healthz(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        """Legacy alias of /readyz (kept for external monitors; DB error => 503)."""
        db_status, db_ms, db_error = await _db_status(settings)
        if db_status != "ok":
            raise HTTPException(
                status_code=503,
                detail={
                    "status": "error",
                    "db": db_status,
                    "db_error": db_error,
                    "db_check_ms": db_ms,
                    "version": API_VERSION,
                },
            )
        return {"status": "ok", "db": db_status, "db_check_ms": db_ms, "version": API_VERSION}

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

    @app.get("/api/v1/geocode")
    async def geocode(
        settings: Annotated[Settings, Depends(get_settings)],
        q: Annotated[str, Query(min_length=1, max_length=200)],
    ) -> list[dict]:
        """Nominatim /search proxy, same-origin from the browser's view.

        Keeps the browser from calling nominatim.openstreetmap.org directly
        (see app/geocode.py for why that is unreliable). Returns the raw
        item list untouched — an empty list is a legitimate "no candidates"
        result, distinct from the 503 raised on upstream failure.
        """
        try:
            return await geocode_search(q, settings)
        except GeocodeUnavailableError as exc:
            raise HTTPException(status_code=503, detail="geocoding upstream unavailable") from exc

    @app.get("/api/v1/reverse-geocode")
    async def reverse_geocode(
        settings: Annotated[Settings, Depends(get_settings)],
        lat: Annotated[float, Query(ge=-90.0, le=90.0)],
        lon: Annotated[float, Query(ge=-180.0, le=180.0)],
    ) -> dict:
        """Nominatim /reverse proxy, same-origin from the browser's view."""
        try:
            return await geocode_reverse(lat, lon, settings)
        except GeocodeUnavailableError as exc:
            raise HTTPException(status_code=503, detail="geocoding upstream unavailable") from exc

    @app.get("/api/v1/ai/status")
    async def ai_status(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
        """AI 設定状態（サーバー側のみ）。API キーは絶対に返さない。"""
        return {
            "configured": bool(settings.anthropic_api_key),
            "model": settings.anthropic_model,
        }

    @app.post("/api/v1/ai/memo")
    async def ai_memo(
        req: AiMemoRequest,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict:
        """AI 調査メモ生成ブローカー。キーはサーバー環境変数のみで管理する。"""
        # 監査用のユーザー識別子。web 層（server.mjs）が Cloudflare Access JWT を検証した
        # 後に付与する内部ヘッダのみを信用する（クライアント直送分は web 層で除去される）。
        # 未設定時（LAN 開発モード等）は anonymous として記録する。
        user = (request.headers.get("x-ocsrc-user") or "").strip()[:128] or "anonymous"
        started = time.monotonic()
        audit = {
            "event": "ai_memo",
            "user": user,
            "prompt_chars": len(req.prompt),
            "model": settings.anthropic_model,
            "ts": datetime.now(UTC).isoformat(),
        }

        # レート制限（固定窓・プロセス内）。AI 未設定でもスパムは拒否する。
        now = time.monotonic()
        window = settings.anthropic_rate_limit_window_seconds
        while ai_call_times and now - ai_call_times[0] > window:
            ai_call_times.popleft()
        if len(ai_call_times) >= settings.anthropic_rate_limit_per_window:
            rate_message = "AI 利用量の上限に達しました。時間をおいて再試行してください。"
            _log_ai_audit(audit, status="rate_limited", status_code=429)
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error": rate_message},
            )
        if ai_semaphore.locked():
            concurrency_message = "AI 生成の同時実行数が上限です。時間をおいて再試行してください。"
            _log_ai_audit(audit, status="concurrency_limited", status_code=429)
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error": concurrency_message},
            )
        if not settings.anthropic_api_key:
            message = "AI はサーバー側で未設定です（OCSRC_ANTHROPIC_API_KEY 未設定）"
            _log_ai_audit(audit, status="not_configured", status_code=503)
            return JSONResponse(
                status_code=503,
                content={"ok": False, "error": message},
            )
        async with ai_semaphore:
            ai_call_times.append(now)
            try:
                text = await call_anthropic(settings, req.prompt)
            except AiUpstreamError as exc:
                status = exc.status if exc.status in (401, 429, 502, 503) else 502
                _log_ai_audit(
                    audit,
                    status="upstream_error",
                    status_code=status,
                    duration_ms=_elapsed_ms(started),
                )
                return JSONResponse(status_code=status, content={"ok": False, "error": exc.message})
        text = ensure_disclaimer(text)
        warnings = find_forbidden_expressions(text)
        _log_ai_audit(
            audit,
            status="ok",
            status_code=200,
            duration_ms=_elapsed_ms(started),
            warnings=len(warnings),
        )
        return {
            "ok": True,
            "text": text,
            "model": settings.anthropic_model,
            "warnings": warnings,
        }

    return app


async def _db_status(settings: Settings) -> tuple[str, float, str | None]:
    if settings.database_url is None:
        return "not_configured", 0.0, None
    return await check_database(
        settings.database_url, timeout=settings.db_check_timeout_seconds
    )


def _elapsed_ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


def _log_ai_audit(
    audit: dict,
    *,
    status: str,
    status_code: int,
    duration_ms: int | None = None,
    warnings: int | None = None,
) -> None:
    """Emit a structured AI usage audit entry (prompt content is never logged)."""
    entry = dict(audit)
    entry.update(
        {
            "status": status,
            "status_code": status_code,
        }
    )
    if duration_ms is not None:
        entry["duration_ms"] = duration_ms
    if warnings is not None:
        entry["warnings"] = warnings
    logger.info("ai_audit %s", json.dumps(entry, ensure_ascii=False))


app = create_app()

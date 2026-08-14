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
  GET /api/v1/ai/usage       — AI usage summary (DB-backed, Issue #20 eval)
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
from pydantic import BaseModel, Field

from .ai import (
    AiMemoRequest,
    AiUpstreamError,
    call_anthropic,
    ensure_disclaimer,
    find_forbidden_expressions,
)
from .ai_usage import ensure_ai_usage_schema, record_ai_usage, summarize_ai_usage
from .cases import (
    ACTIONS,
    can_transition,
    create_case,
    delete_case,
    ensure_case_schema,
    get_case,
    list_audit,
    list_cases,
    record_audit,
    resolve_role,
    role_has,
    transition_case,
    update_case,
)
from .data_sources import (
    ensure_data_source_schema,
    list_data_sources,
    list_refreshes,
)
from .db import check_database, close_pools, get_pool
from .geocode import GeocodeUnavailableError
from .geocode import reverse as geocode_reverse
from .geocode import search as geocode_search
from .ksj import assess_hazard, query_nearby
from .settings import Settings, get_settings

API_VERSION = "0.2.0"
logger = logging.getLogger("ocsrc.api")


class CaseCreateRequest(BaseModel):
    """案件作成リクエスト（Issue #111）。findings はフロントの Finding 型互換の dict 配列。"""

    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default="", max_length=300)
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    radius_m: int = Field(ge=1, le=50_000)
    counts: dict[str, int] = Field(default_factory=dict)
    findings: list[dict] = Field(default_factory=list)


class CaseUpdateRequest(BaseModel):
    """案件更新リクエスト。None のフィールドは変更しない。"""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lon: float | None = Field(default=None, ge=-180.0, le=180.0)
    radius_m: int | None = Field(default=None, ge=1, le=50_000)
    counts: dict[str, int] | None = None
    findings: list[dict] | None = None


def _ensure_audit_logger() -> None:
    """Attach a console handler to the audit logger.

    uvicorn only configures handlers for its own loggers (uvicorn.*), so
    INFO records from ``ocsrc.api`` would otherwise be silently dropped in
    production even though access logs are visible (2026-08-12 smoke test).
    Audit lines (ai_audit) must reach journald/stderr; prompt content is
    never logged by callers.
    """
    if logger.handlers:
        return
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)


_ensure_audit_logger()


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

    @app.get("/api/v1/hazard-assess")
    async def hazard_assess(
        settings: Annotated[Settings, Depends(get_settings)],
        lat: Annotated[float, Query(ge=-90.0, le=90.0)],
        lon: Annotated[float, Query(ge=-180.0, le=180.0)],
        radius_m: Annotated[int, Query(ge=1, le=50_000)] = 5_000,
    ) -> dict:
        """ハザード区域判定（Issue #112）。

        浸水想定（A31）・土砂災害警戒（A33）相当のポリゴン（dataset='hazard'）に対して
        ST_Contains で区域内判定、ST_Distance で最寄り区域までの距離を返す。
        タイル目視から公式区域内判定へ昇格する（断定表現はしない・出典・基準年を併記）。
        DB 未整備・未到達時は 503（「該当なし」と「取得失敗」を区別・NFR-504）。
        """
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                result = await assess_hazard(conn, lat=lat, lon=lon, radius_m=float(radius_m))
        except HTTPException:
            raise
        except Exception as exc:  # driver missing, connection refused, bad schema
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        result["meta"] = {"lat": lat, "lon": lon, "radius_m": radius_m}
        return result

    @app.get("/api/v1/data-sources")
    async def data_sources_list(
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict:
        """データソース台帳一覧（Issue #174・サーバ側永続化）。

        data_sources / data_source_refreshes テーブルから、各データソースのメタ情報と
        再取込履歴を返す。feature flag（OCSRC_DATA_SOURCE_STORE_ENABLED）が無効のときは
        503 を返し、本番に無影響のまま preview/dev で検証できる。デモ用の架空データは
        seed で投入される（実在情報を含まない）。
        """
        if not settings.data_source_store_enabled:
            raise HTTPException(
                status_code=503,
                detail="data source store is not enabled (OCSRC_DATA_SOURCE_STORE_ENABLED=false)",
            )
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                await ensure_data_source_schema(conn)
                items = await list_data_sources(conn)
                refreshes = await list_refreshes(conn)
        except HTTPException:
            raise
        except Exception as exc:  # driver missing, connection refused, bad schema
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        # 再取込履歴をソースごとにまとめて返す（フロントは台帳 + 履歴を一括表示できる）。
        refreshes_by_source: dict[str, list[dict]] = {}
        for r in refreshes:
            refreshes_by_source.setdefault(r.source_id, []).append(r.to_dict())
        return {
            "status": "ok",
            "count": len(items),
            "items": [s.to_dict() for s in items],
            "refreshes": refreshes_by_source,
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
            await _audit_ai(settings, audit, status="rate_limited", status_code=429)
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error": rate_message},
            )
        if ai_semaphore.locked():
            concurrency_message = "AI 生成の同時実行数が上限です。時間をおいて再試行してください。"
            await _audit_ai(settings, audit, status="concurrency_limited", status_code=429)
            return JSONResponse(
                status_code=429,
                content={"ok": False, "error": concurrency_message},
            )
        if not settings.anthropic_api_key:
            message = "AI はサーバー側で未設定です（OCSRC_ANTHROPIC_API_KEY 未設定）"
            await _audit_ai(settings, audit, status="not_configured", status_code=503)
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
                await _audit_ai(
                    settings,
                    audit,
                    status="upstream_error",
                    status_code=status,
                    duration_ms=_elapsed_ms(started),
                )
                return JSONResponse(status_code=status, content={"ok": False, "error": exc.message})
        text = ensure_disclaimer(text)
        warnings = find_forbidden_expressions(text)
        await _audit_ai(
            settings,
            audit,
            status="ok",
            status_code=200,
            duration_ms=_elapsed_ms(started),
            warnings=len(warnings),
            completion_chars=len(text),
        )
        return {
            "ok": True,
            "text": text,
            "model": settings.anthropic_model,
            "warnings": warnings,
        }

    @app.get("/api/v1/ai/usage")
    async def ai_usage(
        settings: Annotated[Settings, Depends(get_settings)],
        days: Annotated[int, Query(ge=1, le=90)] = 30,
    ) -> dict:
        """AI 利用実績の集計（評価書 #20・費用管理）。

        直近 days 日の呼び出し数・成功/失敗・文字数・概算費用を返す。
        DB 未設定・未到達は 503（「0 件（該当なし）」と「取得失敗」を区別・NFR-504）。
        プロンプト本文は記録・返却しない。
        """
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                await ensure_ai_usage_schema(conn)
                return await summarize_ai_usage(
                    conn,
                    days=days,
                    input_rate=settings.ai_cost_input_usd_per_1m_tokens,
                    output_rate=settings.ai_cost_output_usd_per_1m_tokens,
                )
        except HTTPException:
            raise
        except Exception as exc:  # driver missing, connection refused, bad schema
            logger.warning("ai usage summary unavailable: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="database unavailable") from exc

    # ------------------------------------------------------------------
    # 案件台帳 API（Issue #111）。feature flag（OCSRC_CASE_STORE_ENABLED）
    # が無効のときは 503 を返し、本番に無影響のまま preview/dev で検証できる。
    # ------------------------------------------------------------------

    def _case_store_guard(
        settings: Annotated[Settings, Depends(get_settings)],
    ) -> None:
        """案件台帳 feature flag ゲート（依存解決で body 検証より先に 503 を返す）。"""
        if not settings.case_store_enabled:
            raise HTTPException(
                status_code=503,
                detail="case store is not enabled (OCSRC_CASE_STORE_ENABLED=false)",
            )

    def _actor(request: Request) -> str:
        """監査・認可用のユーザー識別子。

        web 層（server.mjs）が Cloudflare Access JWT を検証した後に付与する
        内部ヘッダ X-OCSRC-User のみを信用する（クライアント直送分は web 層で
        除去済み）。未設定時（LAN 開発モード等）は anonymous として扱う。
        """
        return (request.headers.get("x-ocsrc-user") or "").strip()[:128] or "anonymous"

    def _require(role: str, required: str, *, user: str) -> str:
        """ロール要件チェック。不足時は 403（権限不足を偽装しない）。"""
        if not role_has(role, required):
            raise HTTPException(
                status_code=403,
                detail=f"permission denied: {required} role required (current={role}, user={user})",
            )
        return role

    def _role_of(cfg: Settings, user: str) -> str:
        return resolve_role(
            user,
            admin_users=cfg.case_admin_list,
            approver_users=cfg.case_approver_list,
            editor_users=cfg.case_editor_list,
            auditor_users=cfg.case_auditor_list,
        )

    @app.get("/api/v1/cases")
    async def cases_list(
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
        limit: Annotated[int, Query(ge=1, le=500)] = 100,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> dict:
        """案件一覧（viewer 以上）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "viewer", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                items = await list_cases(conn, limit=limit, offset=offset)
        except Exception as exc:  # driver missing, connection refused, bad schema
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        return {"status": "ok", "count": len(items), "items": [c.to_dict() for c in items]}

    @app.post("/api/v1/cases", status_code=201)
    async def cases_create(
        req: CaseCreateRequest,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件作成（editor 以上）。作成者は監査用 actor として記録する。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "editor", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                await ensure_case_schema(conn)
                case = await create_case(
                    conn,
                    code=req.code,
                    name=req.name,
                    address=req.address,
                    lat=req.lat,
                    lon=req.lon,
                    radius_m=req.radius_m,
                    counts=req.counts,
                    findings=req.findings,
                    created_by=user,
                )
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case.id),
                    action=ACTIONS["CASE_CREATED"],
                    actor=user,
                    detail={"code": case.code, "status": case.status},
                )
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        return {"status": "ok", "case": case.to_dict()}

    @app.get("/api/v1/cases/{case_id}")
    async def cases_get(
        case_id: int,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件詳細（viewer 以上）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "viewer", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                case = await get_case(conn, case_id)
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        if case is None:
            raise HTTPException(status_code=404, detail="case not found")
        return {"status": "ok", "case": case.to_dict()}

    @app.patch("/api/v1/cases/{case_id}")
    async def cases_update(
        case_id: int,
        req: CaseUpdateRequest,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件更新（editor 以上・approved は admin のみ）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "editor", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                existing = await get_case(conn, case_id)
                if existing is None:
                    raise HTTPException(status_code=404, detail="case not found")
                if existing.status == "approved" and not role_has(role, "admin"):
                    raise HTTPException(
                        status_code=403,
                        detail="approved cases can only be updated by admin",
                    )
                case = await update_case(
                    conn,
                    case_id,
                    name=req.name,
                    address=req.address,
                    lat=req.lat,
                    lon=req.lon,
                    radius_m=req.radius_m,
                    counts=req.counts,
                    findings=req.findings,
                    updated_by=user,
                )
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case_id),
                    action=ACTIONS["CASE_UPDATED"],
                    actor=user,
                    detail={"code": existing.code, "status": case.status if case else None},
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        if case is None:
            raise HTTPException(status_code=404, detail="case not found")
        return {"status": "ok", "case": case.to_dict()}

    @app.post("/api/v1/cases/{case_id}/submit")
    async def cases_submit(
        case_id: int,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件を承認申請へ遷移（draft→submitted、editor 以上）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "editor", user=user)
        return await _transition(case_id, "submitted", user, settings)

    @app.post("/api/v1/cases/{case_id}/approve")
    async def cases_approve(
        case_id: int,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件を承認（submitted→approved、approver 以上）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "approver", user=user)
        return await _transition(case_id, "approved", user, settings)

    async def _transition(case_id: int, to_status: str, user: str, cfg: Settings) -> dict:
        if cfg.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        action = (
            ACTIONS["CASE_APPROVED"] if to_status == "approved" else ACTIONS["CASE_SUBMITTED"]
        )
        try:
            pool = await get_pool(cfg.database_url)
            async with pool.acquire() as conn:
                existing = await get_case(conn, case_id)
                if existing is None:
                    raise HTTPException(status_code=404, detail="case not found")
                if not can_transition(existing.status, to_status):
                    raise HTTPException(
                        status_code=409,
                        detail=f"invalid transition {existing.status} -> {to_status}",
                    )
                case = await transition_case(conn, case_id, to_status=to_status, actor=user)
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case_id),
                    action=action,
                    actor=user,
                    detail={"code": existing.code, "from": existing.status, "to": to_status},
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        if case is None:
            raise HTTPException(status_code=404, detail="case not found")
        return {"status": "ok", "case": case.to_dict()}

    @app.delete("/api/v1/cases/{case_id}")
    async def cases_delete(
        case_id: int,
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
    ) -> dict:
        """案件削除（admin のみ）。監査ログは残す（証跡の改ざん防止）。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "admin", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                existing = await get_case(conn, case_id)
                if existing is None:
                    raise HTTPException(status_code=404, detail="case not found")
                deleted = await delete_case(conn, case_id)
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case_id),
                    action=ACTIONS["CASE_DELETED"],
                    actor=user,
                    detail={"code": existing.code, "name": existing.name},
                )
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        if not deleted:
            raise HTTPException(status_code=404, detail="case not found")
        return {"status": "ok", "deleted": True, "id": case_id}

    @app.get("/api/v1/audit")
    async def audit_list(
        request: Request,
        settings: Annotated[Settings, Depends(get_settings)],
        _guard: None = Depends(_case_store_guard),
        entity: str | None = Query(default=None, max_length=32),
        entity_id: str | None = Query(default=None, max_length=64),
        limit: Annotated[int, Query(ge=1, le=500)] = 100,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> dict:
        """監査ログ閲覧（auditor 以上）。actor と action は記録するが本文は記録しない。"""
        user = _actor(request)
        role = _role_of(settings, user)
        _require(role, "auditor", user=user)
        if settings.database_url is None:
            raise HTTPException(status_code=503, detail="database not configured")
        try:
            pool = await get_pool(settings.database_url)
            async with pool.acquire() as conn:
                entries = await list_audit(
                    conn, entity=entity, entity_id=entity_id, limit=limit, offset=offset
                )
        except Exception as exc:
            raise HTTPException(status_code=503, detail="database unavailable") from exc
        return {"status": "ok", "count": len(entries), "items": [e.to_dict() for e in entries]}

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


async def _audit_ai(
    settings: Settings,
    audit: dict,
    *,
    status: str,
    status_code: int,
    duration_ms: int | None = None,
    warnings: int | None = None,
    completion_chars: int = 0,
) -> None:
    """AI 呼び出しの監査ログ出力 + DB 記録（評価書 #20）。

    ログ出力は従来どおり（ai_audit）。DB 記録は best-effort で、DB 未設定・
    未到達・失敗でも AI メモ生成フローは継続する。プロンプト本文は記録しない。
    """
    _log_ai_audit(
        audit,
        status=status,
        status_code=status_code,
        duration_ms=duration_ms,
        warnings=warnings,
    )
    if settings.database_url is None:
        return
    try:
        pool = await get_pool(settings.database_url)
        async with pool.acquire() as conn:
            await ensure_ai_usage_schema(conn)
            await record_ai_usage(
                conn,
                user_id=str(audit.get("user", "anonymous")),
                model=str(audit.get("model", "")),
                status=status,
                status_code=status_code,
                prompt_chars=int(audit.get("prompt_chars", 0)),
                completion_chars=completion_chars,
                duration_ms=duration_ms,
                warnings=warnings,
            )
    except Exception as exc:  # noqa: BLE001 — best-effort recording
        logger.warning("ai_usage record skipped: %s", type(exc).__name__)


app = create_app()

"""案件台帳（サーバ側永続化）・RBAC・監査ログ・承認ワークフロー（Issue #111）。

設計方針:
- 既存の ksj_features テーブルには非干渉の additive migration のみ（CREATE TABLE IF NOT EXISTS）。
- 認証は web 層（server.mjs）が Cloudflare Access JWT を検証した後に付与する
  ``X-OCSRC-User`` 内部ヘッダを actor として使用する。ロール割当はサーバー側
  環境変数（OCSRC_CASE_*_USERS、カンマ区切り）で管理し、未割当ユーザーは viewer。
- 監査ログ（audit_log）は追記型テーブル。actor・時刻・対象・action を記録し、
  本文（プロンプト等）は記録しない。
- 承認ワークフローは最小の状態遷移 ``draft → submitted → approved``。
  approved の更新は admin のみ（再編集はバックログ）。
- 本番は feature flag（OCSRC_CASE_STORE_ENABLED、既定 false）で無効化し、
  API は 503 を返す。有効化は preview/dev 環境での検証後に判断する。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

# ---------------------------------------------------------------------------
# スキーマ（additive・冪等）
# ---------------------------------------------------------------------------

CASE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cases (
    id BIGSERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    radius_m INTEGER NOT NULL CHECK (radius_m > 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved')),
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    findings JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT,
    updated_at TIMESTAMPTZ,
    approved_by TEXT,
    approved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cases_status_ix ON cases (status);
CREATE INDEX IF NOT EXISTS cases_created_at_ix ON cases (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_entity_ix ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_ts_ix ON audit_log (ts DESC);
"""

# 承認ワークフローの状態遷移（最小）。
CASE_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"submitted"},
    "submitted": {"approved"},
    "approved": set(),
}

# ロール優先度（高いほど権限が広い）。
ROLE_PRIORITY = {"viewer": 0, "auditor": 1, "editor": 2, "approver": 3, "admin": 4}

# 監査 action の正規名（コード上の typo を防ぐ）。
ACTIONS = {
    "CASE_CREATED": "case_created",
    "CASE_UPDATED": "case_updated",
    "CASE_SUBMITTED": "case_submitted",
    "CASE_APPROVED": "case_approved",
    "CASE_DELETED": "case_deleted",
    "ANALYSIS_RUN": "analysis_run",
    "REPORT_EXPORTED": "report_exported",
    "MEMO_GENERATED": "memo_generated",
}


@dataclass
class CaseRecord:
    id: int
    code: str
    name: str
    address: str
    lat: float
    lon: float
    radius_m: int
    status: str
    counts: dict[str, int]
    findings: list[dict[str, Any]]
    created_by: str
    created_at: str
    updated_by: str | None
    updated_at: str | None
    approved_by: str | None
    approved_at: str | None

    @classmethod
    def from_row(cls, row: Any) -> CaseRecord:
        return cls(
            id=row["id"],
            code=row["code"],
            name=row["name"],
            address=row["address"],
            lat=float(row["lat"]),
            lon=float(row["lon"]),
            radius_m=row["radius_m"],
            status=row["status"],
            counts=_json_value(row["counts"], fallback={}),
            findings=_json_value(row["findings"], fallback=[]),
            created_by=row["created_by"],
            created_at=row["created_at"].isoformat() if row["created_at"] else "",
            updated_by=row["updated_by"],
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else None,
            approved_by=row["approved_by"],
            approved_at=row["approved_at"].isoformat() if row["approved_at"] else None,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "address": self.address,
            "lat": self.lat,
            "lon": self.lon,
            "radius_m": self.radius_m,
            "status": self.status,
            "counts": self.counts,
            "findings": self.findings,
            "created_by": self.created_by,
            "created_at": self.created_at,
            "updated_by": self.updated_by,
            "updated_at": self.updated_at,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at,
        }


@dataclass
class AuditEntry:
    id: int
    entity: str
    entity_id: str
    action: str
    actor: str
    detail: dict[str, Any]
    ts: str

    @classmethod
    def from_row(cls, row: Any) -> AuditEntry:
        return cls(
            id=row["id"],
            entity=row["entity"],
            entity_id=row["entity_id"],
            action=row["action"],
            actor=row["actor"],
            detail=_json_value(row["detail"], fallback={}),
            ts=row["ts"].isoformat() if row["ts"] else "",
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "entity": self.entity,
            "entity_id": self.entity_id,
            "action": self.action,
            "actor": self.actor,
            "detail": self.detail,
            "ts": self.ts,
        }


# ---------------------------------------------------------------------------
# RBAC
# ---------------------------------------------------------------------------


def _json_value(value: Any, *, fallback: Any) -> Any:
    """PostgreSQL JSONB の読み取り値を安全に Python オブジェクトへ変換する。

    asyncpg の JSONB デコードは接続設定により ``str``（未デコード）または
    ``dict``/``list``（デコード済み）のどちらでも返り得るため、両方に対応する。
    """
    if value is None:
        return fallback
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return fallback
    return value


def resolve_role(user: str, *, admin_users: list[str], approver_users: list[str],
                 editor_users: list[str], auditor_users: list[str]) -> str:
    """ユーザー識別子からロールを解決する（未割当は viewer）。

    admin が最上位。同一ユーザーが複数リストにいる場合は最上位ロールを返す。
    """
    if user in admin_users:
        return "admin"
    if user in approver_users:
        return "approver"
    if user in editor_users:
        return "editor"
    if user in auditor_users:
        return "auditor"
    return "viewer"


def role_has(role: str, required: str) -> bool:
    """role が required 以上の権限を持つか（ロール優先度比較）。"""
    return ROLE_PRIORITY.get(role, 0) >= ROLE_PRIORITY.get(required, 0)


def can_transition(from_status: str, to_status: str) -> bool:
    """承認ワークフローの状態遷移が許されるか。"""
    return to_status in CASE_TRANSITIONS.get(from_status, set())


# ---------------------------------------------------------------------------
# CRUD（asyncpg コネクション前提）
# ---------------------------------------------------------------------------


async def ensure_case_schema(conn: Any) -> None:
    """cases / audit_log テーブルを冪等に作成する（additive migration）。"""
    await conn.execute(CASE_SCHEMA_SQL)


async def create_case(
    conn: Any,
    *,
    code: str,
    name: str,
    address: str,
    lat: float,
    lon: float,
    radius_m: int,
    counts: dict[str, int],
    findings: list[dict[str, Any]],
    created_by: str,
) -> CaseRecord:
    row = await conn.fetchrow(
        """
        INSERT INTO cases (code, name, address, lat, lon, radius_m, counts, findings, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
        RETURNING *
        """,
        code,
        name,
        address,
        lat,
        lon,
        radius_m,
        json.dumps(counts, ensure_ascii=False),
        json.dumps(findings, ensure_ascii=False),
        created_by,
    )
    return CaseRecord.from_row(row)


async def list_cases(conn: Any, *, limit: int = 100, offset: int = 0) -> list[CaseRecord]:
    rows = await conn.fetch(
        """
        SELECT * FROM cases
        ORDER BY created_at DESC, id DESC
        LIMIT $1 OFFSET $2
        """,
        limit,
        offset,
    )
    return [CaseRecord.from_row(r) for r in rows]


async def get_case(conn: Any, case_id: int) -> CaseRecord | None:
    row = await conn.fetchrow("SELECT * FROM cases WHERE id = $1", case_id)
    return CaseRecord.from_row(row) if row else None


async def update_case(
    conn: Any,
    case_id: int,
    *,
    name: str | None,
    address: str | None,
    lat: float | None,
    lon: float | None,
    radius_m: int | None,
    counts: dict[str, int] | None,
    findings: list[dict[str, Any]] | None,
    updated_by: str,
) -> CaseRecord | None:
    row = await conn.fetchrow(
        """
        UPDATE cases
        SET name = COALESCE($2, name),
            address = COALESCE($3, address),
            lat = COALESCE($4, lat),
            lon = COALESCE($5, lon),
            radius_m = COALESCE($6, radius_m),
            counts = COALESCE($7::jsonb, counts),
            findings = COALESCE($8::jsonb, findings),
            updated_by = $9,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        """,
        case_id,
        name,
        address,
        lat,
        lon,
        radius_m,
        json.dumps(counts, ensure_ascii=False) if counts is not None else None,
        json.dumps(findings, ensure_ascii=False) if findings is not None else None,
        updated_by,
    )
    return CaseRecord.from_row(row) if row else None


async def transition_case(
    conn: Any, case_id: int, *, to_status: str, actor: str
) -> CaseRecord | None:
    """承認WFの状態遷移（draft→submitted→approved）を原子的に行う。

    遷移可否は呼び出し側（API）でロールと併せて判定済みとする。approved へ
    遷移する場合は approved_by / approved_at を記録する。
    """
    if to_status == "approved":
        row = await conn.fetchrow(
            """
            UPDATE cases
            SET status = $2,
                approved_by = $3,
                approved_at = now(),
                updated_by = $3,
                updated_at = now()
            WHERE id = $1
            RETURNING *
            """,
            case_id,
            to_status,
            actor,
        )
    else:
        row = await conn.fetchrow(
            """
            UPDATE cases
            SET status = $2, updated_by = $3, updated_at = now()
            WHERE id = $1
            RETURNING *
            """,
            case_id,
            to_status,
            actor,
        )
    return CaseRecord.from_row(row) if row else None


async def delete_case(conn: Any, case_id: int) -> bool:
    res = await conn.execute("DELETE FROM cases WHERE id = $1", case_id)
    return res.endswith("1")


# ---------------------------------------------------------------------------
# 監査ログ
# ---------------------------------------------------------------------------


async def record_audit(
    conn: Any,
    *,
    entity: str,
    entity_id: str,
    action: str,
    actor: str,
    detail: dict[str, Any] | None = None,
) -> None:
    """監査ログへ追記する。detail には本文・秘密情報を含めないこと。"""
    await conn.execute(
        """
        INSERT INTO audit_log (entity, entity_id, action, actor, detail)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        """,
        entity,
        entity_id,
        action,
        actor,
        json.dumps(detail or {}, ensure_ascii=False),
    )


async def list_audit(
    conn: Any, *, entity: str | None = None, entity_id: str | None = None,
    limit: int = 100, offset: int = 0,
) -> list[AuditEntry]:
    where: list[str] = []
    params: list[Any] = []
    if entity:
        where.append(f"entity = ${len(params) + 1}")
        params.append(entity)
    if entity_id:
        where.append(f"entity_id = ${len(params) + 1}")
        params.append(entity_id)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    params.extend([limit, offset])
    rows = await conn.fetch(
        f"""
        SELECT * FROM audit_log
        {clause}
        ORDER BY ts DESC, id DESC
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
        """,
        *params,
    )
    return [AuditEntry.from_row(r) for r in rows]

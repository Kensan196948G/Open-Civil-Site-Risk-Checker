"""データソース台帳のサーバ側永続化（Issue #174・データ鮮度・ライセンス台帳）。

設計方針:
- 既存テーブル（cases / audit_log / ksj_features）に非干渉の additive migration。
- ``data_sources``: 各データソースのメタ情報（名称・提供元・ライセンス・元データ更新日・
  利用条件メモ・最終取得日時）。
- ``data_source_refreshes``: 再取込履歴（追記型。データソースごとの再取込日時と内容）。
- feature flag（OCSRC_DATA_SOURCE_STORE_ENABLED、既定 false）で本番無影響。
  無効時は API が 503 を返す。有効化は preview/dev 環境での検証後に判断する。
- 実データは本番では使わず、デモ用の架空データを seed で投入する（実在情報を含まない）。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

DATA_SOURCE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS data_sources (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    license TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'api' CHECK (type IN ('api', 'db', 'tile')),
    rank TEXT NOT NULL DEFAULT 'B' CHECK (rank IN ('A', 'B', 'C')),
    source_updated_at TEXT NOT NULL DEFAULT '',
    usage_note TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_sources_source_id_ix ON data_sources (source_id);

CREATE TABLE IF NOT EXISTS data_source_refreshes (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_source_refreshes_source_id_ix ON data_source_refreshes (source_id);
"""


@dataclass
class DataSource:
    id: int
    source_id: str
    name: str
    provider: str
    license: str
    type: str
    rank: str
    source_updated_at: str
    usage_note: str
    fetched_at: str
    enabled: bool

    @classmethod
    def from_row(cls, row: Any) -> DataSource:
        return cls(
            id=row["id"],
            source_id=row["source_id"],
            name=row["name"],
            provider=row["provider"],
            license=row["license"],
            type=row["type"],
            rank=row["rank"],
            source_updated_at=row["source_updated_at"],
            usage_note=row["usage_note"],
            fetched_at=row["fetched_at"],
            enabled=row["enabled"],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "name": self.name,
            "provider": self.provider,
            "license": self.license,
            "type": self.type,
            "rank": self.rank,
            "source_updated_at": self.source_updated_at,
            "usage_note": self.usage_note,
            "fetched_at": self.fetched_at,
            "enabled": self.enabled,
        }


@dataclass
class DataSourceRefresh:
    id: int
    source_id: str
    note: str
    at: str

    @classmethod
    def from_row(cls, row: Any) -> DataSourceRefresh:
        return cls(
            id=row["id"],
            source_id=row["source_id"],
            note=row["note"],
            at=row["at"].isoformat() if row["at"] else "",
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "note": self.note,
            "at": self.at,
        }


async def ensure_data_source_schema(conn: Any) -> None:
    """data_sources / data_source_refreshes を冪等に作成する（additive migration）。"""
    await conn.execute(DATA_SOURCE_SCHEMA_SQL)


async def upsert_data_source(
    conn: Any,
    *,
    source_id: str,
    name: str,
    provider: str,
    license: str,
    type: str,
    rank: str,
    source_updated_at: str,
    usage_note: str,
    fetched_at: str = "",
    enabled: bool = True,
) -> DataSource:
    """データソースを upsert する（source_id がキー・再実行は更新）。"""
    row = await conn.fetchrow(
        """
        INSERT INTO data_sources
            (source_id, name, provider, license, type, rank,
             source_updated_at, usage_note, fetched_at, enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (source_id) DO UPDATE SET
            name = EXCLUDED.name,
            provider = EXCLUDED.provider,
            license = EXCLUDED.license,
            type = EXCLUDED.type,
            rank = EXCLUDED.rank,
            source_updated_at = EXCLUDED.source_updated_at,
            usage_note = EXCLUDED.usage_note,
            fetched_at = EXCLUDED.fetched_at,
            enabled = EXCLUDED.enabled,
            updated_at = now()
        RETURNING *
        """,
        source_id,
        name,
        provider,
        license,
        type,
        rank,
        source_updated_at,
        usage_note,
        fetched_at,
        enabled,
    )
    return DataSource.from_row(row)


async def list_data_sources(conn: Any) -> list[DataSource]:
    rows = await conn.fetch(
        "SELECT * FROM data_sources ORDER BY source_id ASC"
    )
    return [DataSource.from_row(r) for r in rows]


async def record_refresh(conn: Any, *, source_id: str, note: str) -> DataSourceRefresh:
    """再取込履歴を追記する（受入条件: 再取込時に履歴が自動追記される）。
    """
    row = await conn.fetchrow(
        "INSERT INTO data_source_refreshes (source_id, note) VALUES ($1, $2) RETURNING *",
        source_id,
        note,
    )
    return DataSourceRefresh.from_row(row)


async def list_refreshes(
    conn: Any, *, source_id: str | None = None, limit: int = 100
) -> list[DataSourceRefresh]:
    if source_id:
        rows = await conn.fetch(
            "SELECT * FROM data_source_refreshes "
            "WHERE source_id = $1 ORDER BY at DESC, id DESC LIMIT $2",
            source_id,
            limit,
        )
    else:
        rows = await conn.fetch(
            "SELECT * FROM data_source_refreshes "
            "ORDER BY at DESC, id DESC LIMIT $1",
            limit,
        )
    return [DataSourceRefresh.from_row(r) for r in rows]


async def seed_demo_data_sources(conn: Any) -> int:
    """デモ用の架空データソース台帳を投入する（実在情報を含まない・冪等）。"""
    demos = [
        {
            "source_id": "nominatim",
            "name": "OpenStreetMap / Nominatim",
            "provider": "OSMF",
            "license": "ODbL",
            "type": "api",
            "rank": "A",
            "source_updated_at": "日次更新",
            "usage_note": "出典表示義務（© OpenStreetMap contributors）。1 req/sec を遵守。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "osm_overpass",
            "name": "OpenStreetMap / Overpass",
            "provider": "OSMF",
            "license": "ODbL",
            "type": "api",
            "rank": "B",
            "source_updated_at": "日次更新",
            "usage_note": "出典表示義務。Overpass API の利用ポリシー遵守。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "open_meteo",
            "name": "Open-Meteo Forecast",
            "provider": "Open-Meteo",
            "license": "CC BY 4.0",
            "type": "api",
            "rank": "A",
            "source_updated_at": "15分毎",
            "usage_note": "出典表示義務（CC BY 4.0）。商用利用可。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "ksj",
            "name": "国土数値情報",
            "provider": "国土交通省",
            "license": "KSJ規約",
            "type": "db",
            "rank": "A",
            "source_updated_at": "W05: 2021年度（合成）",
            "usage_note": "国土数値情報の利用規約・出典表記に従う。"
            "データセットごとに商用/非商用が異なる。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "hazard_portal",
            "name": "ハザードマップポータル",
            "provider": "国土地理院",
            "license": "出典明示",
            "type": "tile",
            "rank": "A",
            "source_updated_at": "年度版",
            "usage_note": "出典明示。区域内判定は #112 の"
            "合成サンプルで検証。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "gsi_tile",
            "name": "地理院タイル",
            "provider": "国土地理院",
            "license": "地理院条件",
            "type": "tile",
            "rank": "A",
            "source_updated_at": "随時更新",
            "usage_note": "国土地理院の利用規約（出典明示・加工物の明記等）に従う。",
            "fetched_at": "2026-08-12",
        },
        {
            "source_id": "jma_warning",
            "name": "気象庁 警報・注意報",
            "provider": "気象庁",
            "license": "出典明示",
            "type": "api",
            "rank": "A",
            "source_updated_at": "随時更新",
            "usage_note": "気象庁の出典明示（「気象庁発表」等）。",
            "fetched_at": "2026-08-12",
        },
    ]
    inserted = 0
    for spec in demos:
        await upsert_data_source(conn, **spec)
        inserted += 1
        # 再取込履歴（デモ用・初回のみ）
        exists = await conn.fetchval(
            "SELECT 1 FROM data_source_refreshes WHERE source_id = $1", spec["source_id"]
        )
        if not exists:
            await record_refresh(
                conn, source_id=spec["source_id"], note="デモ: 初回登録（実データ取得なし）"
            )
    return inserted

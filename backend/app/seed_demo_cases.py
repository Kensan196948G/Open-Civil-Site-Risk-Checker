"""デモ用ダミー案件・監査ログの seed CLI（Issue #111 / MVP 確認用）。

架空の案件データを `cases` / `audit_log` テーブルへ投入する。人名・会社名・住所・
メール等はすべて明確な架空値で、実在情報・個人情報・会社実データを含まない。
再実行は冪等（同一 code の案件はスキップ）。削除は `--reset` で行う。

Usage (inside backend/, with OCSRC_DATABASE_URL set or --database-url given):

    python -m app.seed_demo_cases          # ダミー案件を投入（既存はスキップ）
    python -m app.seed_demo_cases --reset  # ダミー案件を全削除してから投入
"""

import argparse
import asyncio
import sys

from .cases import (
    ACTIONS,
    create_case,
    ensure_case_schema,
    record_audit,
    transition_case,
)
from .settings import get_settings

# デモ用案件のコードプレフィックス（--reset はこの prefix の案件のみ削除する）。
DEMO_CODE_PREFIX = "OCSRC-DEMO-"

# デモ用ユーザー（すべて架空の識別子）。
DEMO_EDITOR = "demo-editor@example.com"
DEMO_APPROVER = "demo-approver@example.com"

# 架空のデモ案件定義。座標は実在しないデモ地点（架空の工事候補地）として
# 東京都内の一般的な緯度経度帯を使用するが、住所は明示的に「（架空）」を付ける。
DEMO_CASES = [
    {
        "code": "OCSRC-DEMO-2026-101",
        "name": "千代田区 架空橋梁補修候補地",
        "address": "東京都千代田区霞が関2丁目（架空）",
        "lat": 35.6745,
        "lon": 139.7524,
        "radius_m": 500,
        "counts": {"A": 1, "B": 2, "C": 3, "D": 0},
        "findings": [
            {
                "id": "demo-f1",
                "category": "rivers",
                "priority": "B",
                "title": "河川接近（デモ・架空）",
                "summary": "架空の河川ポリゴンが半径内に存在する想定のデモ所見。",
                "status": "found",
                "distance_m": 320.0,
                "caution": "デモデータ（実測値ではありません）",
                "evidence": [
                    {
                        "source_key": "ksj",
                        "layer_name": "河川（デモ）",
                        "attribution": "デモ用サンプル（架空）",
                        "fetched_at": "2026-08-14T00:00:00+09:00",
                        "source_updated_at": "2026（合成）",
                        "quality_note": "デモ用の架空値",
                        "props": {"distance_m": "320"},
                    }
                ],
            }
        ],
    },
    {
        "code": "OCSRC-DEMO-2026-102",
        "name": "江東区 架空護岸補修候補地",
        "address": "東京都江東区豊洲6丁目（架空）",
        "lat": 35.6553,
        "lon": 139.7967,
        "radius_m": 1000,
        "counts": {"A": 2, "B": 1, "C": 2, "D": 1},
        "findings": [],
    },
    {
        "code": "OCSRC-DEMO-2026-103",
        "name": "八王子市 架空道路拡幅候補地",
        "address": "東京都八王子市子安町（架空）",
        "lat": 35.6557,
        "lon": 139.3389,
        "radius_m": 250,
        "counts": {"A": 0, "B": 2, "C": 4, "D": 1},
        "findings": [],
    },
]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Seed demo (fictional) cases and audit entries")
    p.add_argument("--reset", action="store_true", help="delete existing demo cases first")
    p.add_argument(
        "--with-sources",
        action="store_true",
        help="also seed the demo data-source ledger (Issue #174)",
    )
    p.add_argument("--database-url", default=None, help="overrides OCSRC_DATABASE_URL")
    return p


async def run(args: argparse.Namespace) -> int:
    database_url = args.database_url or get_settings().database_url
    if not database_url:
        print(
            "error: no database URL (set OCSRC_DATABASE_URL or pass --database-url)",
            file=sys.stderr,
        )
        return 2

    import asyncpg

    conn = await asyncpg.connect(dsn=database_url)
    try:
        await ensure_case_schema(conn)
        if args.with_sources:
            from .data_sources import ensure_data_source_schema, seed_demo_data_sources

            await ensure_data_source_schema(conn)
            inserted_sources = await seed_demo_data_sources(conn)
            print(f"sources: seeded {inserted_sources} demo data source(s)")
        if args.reset:
            await conn.execute(
                "DELETE FROM cases WHERE code LIKE $1", DEMO_CODE_PREFIX + "%"
            )
            print(f"reset: deleted demo cases (prefix {DEMO_CODE_PREFIX})")

        inserted = 0
        for spec in DEMO_CASES:
            existing = await conn.fetchval(
                "SELECT id FROM cases WHERE code = $1", spec["code"]
            )
            if existing:
                print(f"skip: {spec['code']} (already exists)")
                continue
            case = await create_case(
                conn,
                code=spec["code"],
                name=spec["name"],
                address=spec["address"],
                lat=spec["lat"],
                lon=spec["lon"],
                radius_m=spec["radius_m"],
                counts=spec["counts"],
                findings=spec["findings"],
                created_by=DEMO_EDITOR,
            )
            await record_audit(
                conn,
                entity="case",
                entity_id=str(case.id),
                action=ACTIONS["CASE_CREATED"],
                actor=DEMO_EDITOR,
                detail={"code": case.code, "status": case.status},
            )
            inserted += 1
            print(f"inserted: {case.code} (#{case.id})")

        # 承認WFのデモ状態を作る: 102 を submitted、103 を approved に遷移。
        # 状態遷移は draft → submitted → approved の逐次遷移のみ許可されるため、
        # approved を目指す場合は submitted を経由する。
        for code, to_status in (
            ("OCSRC-DEMO-2026-102", "submitted"),
            ("OCSRC-DEMO-2026-103", "approved"),
        ):
            case_id = await conn.fetchval("SELECT id FROM cases WHERE code = $1", code)
            if case_id is None:
                continue
            row = await conn.fetchrow("SELECT status FROM cases WHERE id = $1", case_id)
            current = row["status"]
            if current == "draft" and to_status in ("submitted", "approved"):
                await transition_case(conn, case_id, to_status="submitted", actor=DEMO_EDITOR)
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case_id),
                    action=ACTIONS["CASE_SUBMITTED"],
                    actor=DEMO_EDITOR,
                    detail={"code": code, "from": "draft", "to": "submitted"},
                )
                print(f"transitioned: {code} -> submitted")
                current = "submitted"
            if current == "submitted" and to_status == "approved":
                await transition_case(conn, case_id, to_status="approved", actor=DEMO_APPROVER)
                await record_audit(
                    conn,
                    entity="case",
                    entity_id=str(case_id),
                    action=ACTIONS["CASE_APPROVED"],
                    actor=DEMO_APPROVER,
                    detail={"code": code, "from": "submitted", "to": "approved"},
                )
                print(f"transitioned: {code} -> approved")

        print(f"done: {inserted} case(s) inserted")
        return 0
    finally:
        await conn.close()


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    sys.exit(main())

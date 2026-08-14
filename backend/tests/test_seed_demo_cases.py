"""seed_demo_cases CLI のテスト（Issue #111 / ダミーデータ投入）。

DB 統合テストは OCSRC_TEST_DATABASE_URL 設定時のみ実行される（CI の PostGIS）。
機能の CLI パーサー・ダミーデータ定義の検証は DB 不要で常時実行される。
"""

import os

import pytest

from app.seed_demo_cases import DEMO_CASES, DEMO_CODE_PREFIX, build_parser

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")


def test_parser_accepts_reset_and_database_url() -> None:
    args = build_parser().parse_args(["--reset", "--database-url", "postgresql://x"])
    assert args.reset is True
    assert args.database_url == "postgresql://x"


def test_demo_cases_are_fictional_and_valid() -> None:
    """ダミーデータが形式・型・制約を満たし、実在情報を含まないことを検証する。"""
    codes = set()
    for spec in DEMO_CASES:
        # 一意な code と prefix
        assert spec["code"].startswith(DEMO_CODE_PREFIX)
        assert spec["code"] not in codes
        codes.add(spec["code"])
        # 型・制約
        assert isinstance(spec["name"], str) and spec["name"]
        assert "（架空）" in spec["address"], "住所は架空であることを明示する"
        assert -90.0 <= spec["lat"] <= 90.0
        assert -180.0 <= spec["lon"] <= 180.0
        assert spec["radius_m"] > 0
        for g in ("A", "B", "C", "D"):
            assert g in spec["counts"] and spec["counts"][g] >= 0
        # findings の必須フィールド
        for f in spec["findings"]:
            assert f["id"] and f["title"] and f["category"] and f["priority"]
            assert f["status"] in ("found", "not_found", "no_data", "failed")
            assert f["distance_m"] is None or f["distance_m"] >= 0


@pytest.mark.skipif(not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set")
def test_seed_is_idempotent_and_reset_cleans(tmp_path) -> None:
    """seed 実行 → 再実行（冪等）→ --reset（削除）を統合的に検証する。"""
    import asyncio

    import asyncpg
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.seed_demo_cases import main as seed_main
    from app.settings import Settings, get_settings

    async def _count() -> int:
        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            return await conn.fetchval(
                "SELECT count(*) FROM cases WHERE code LIKE $1", DEMO_CODE_PREFIX + "%"
            )
        finally:
            await conn.close()

    # 1) 初回投入
    assert seed_main(["--database-url", TEST_DSN]) == 0
    first = asyncio.run(_count())
    assert first == len(DEMO_CASES), f"expected {len(DEMO_CASES)}, got {first}"

    # 2) 再実行は冪等（件数不変・skip）
    assert seed_main(["--database-url", TEST_DSN]) == 0
    assert asyncio.run(_count()) == first

    # 3) API からダミー案件が見える（viewer）
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        case_store_enabled=True,
        case_editor_users="demo-editor@example.com",
        case_approver_users="demo-approver@example.com",
        database_url=TEST_DSN,
    )
    with TestClient(app) as client:
        res = client.get("/api/v1/cases", headers={"X-OCSRC-User": "viewer@example.com"})
        assert res.status_code == 200
        codes = [c["code"] for c in res.json()["items"]]
        assert "OCSRC-DEMO-2026-103" in codes
        # 承認WFのデモ状態
        approved = next(c for c in res.json()["items"] if c["code"] == "OCSRC-DEMO-2026-103")
        assert approved["status"] == "approved"
        assert approved["approved_by"] == "demo-approver@example.com"

    # 4) --reset は「削除してから再投入」する（MVP 確認環境で直ちに操作できる
    #    デモ状態を保証する仕様）。削除後に全件が新規挿入されることを確認する。
    assert seed_main(["--reset", "--database-url", TEST_DSN]) == 0
    assert asyncio.run(_count()) == len(DEMO_CASES)

    # 5) 後始末: デモ状態が復元済み（再実行は冪等）。
    assert seed_main(["--database-url", TEST_DSN]) == 0
    assert asyncio.run(_count()) == len(DEMO_CASES)

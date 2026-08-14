"""データソース台帳 API（Issue #174）の DB 統合テスト。

OCSRC_TEST_DATABASE_URL が設定されている場合のみ実行される（CI の PostGIS
サービス or ローカル PostGIS）。デモ台帳の投入・一覧取得・再取込履歴・
feature flag（無効時 503）を検証する。
"""

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.data_sources import ensure_data_source_schema, seed_demo_data_sources
from app.main import create_app
from app.settings import Settings, get_settings

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set (needs a PostGIS instance)"
)


def make_client(**overrides) -> TestClient:
    base = {
        "_env_file": None,
        "data_source_store_enabled": True,
        "database_url": TEST_DSN,
    }
    base.update(overrides)
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(**base)
    return TestClient(app)


def seed() -> int:
    async def _run() -> int:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_data_source_schema(conn)
            return await seed_demo_data_sources(conn)
        finally:
            await conn.close()

    return asyncio.run(_run())


@pytest.fixture(scope="module")
def client():
    # ``with`` で lifespan を実行する（`TestClient(app)` を直接使うとリクエストごとに
    # イベントループが切り替わり、asyncpg プールが古いループにバインドされて
    # `Event loop is closed` になるため・test_cases_db_integration.py と同じ）。
    with make_client() as c:
        yield c
    # 後始末: テストで投入した台帳を削除する。
    async def _cleanup() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await conn.execute("DELETE FROM data_source_refreshes")
            await conn.execute("DELETE FROM data_sources")
        finally:
            await conn.close()

    asyncio.run(_cleanup())


def test_disabled_flag_returns_503() -> None:
    client = make_client(data_source_store_enabled=False)
    res = client.get("/api/v1/data-sources")
    assert res.status_code == 503
    assert "not enabled" in res.json()["detail"]


def test_list_data_sources_after_seed(client) -> None:
    n = seed()
    assert n >= 5
    res = client.get("/api/v1/data-sources")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    items = body["items"]
    source_ids = [i["source_id"] for i in items]
    # 主要ソースが登録されている
    for k in ["nominatim", "ksj", "hazard_portal", "jma_warning"]:
        assert k in source_ids
    # ライセンス・鮮度・利用条件が保持される
    ksj = next(i for i in items if i["source_id"] == "ksj")
    assert ksj["license"] == "KSJ規約"
    assert "2021年度" in ksj["source_updated_at"]
    assert ksj["usage_note"]


def test_refreshes_recorded_for_seeded_sources(client) -> None:
    seed()
    res = client.get("/api/v1/data-sources")
    body = res.json()
    refreshes = body["refreshes"]
    # seed 時に各ソースへ再取込履歴が記録される
    assert "ksj" in refreshes
    assert any(r["note"] for r in refreshes["ksj"])


def test_seed_is_idempotent(client) -> None:
    first = seed()
    second = seed()
    # upsert のため件数は不変（冪等）
    res = client.get("/api/v1/data-sources")
    assert len(res.json()["items"]) == first
    assert second == first

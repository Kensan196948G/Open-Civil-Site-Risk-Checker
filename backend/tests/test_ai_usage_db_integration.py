"""AI 利用実績（評価書 #20）の DB 統合テスト。

OCSRC_TEST_DATABASE_URL が設定されている場合のみ実行される（CI の PostGIS
サービス or ローカル PostGIS）。ai_usage テーブルへの追記・集計・API 経由の
記録と取得、プロンプト本文の非保存を検証する。
"""

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.ai_usage import ensure_ai_usage_schema, record_ai_usage, summarize_ai_usage
from app.main import create_app
from app.settings import Settings, get_settings

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set (needs a PostGIS instance)"
)

TEST_USER = "usage-test@example.com"


async def _clean(conn) -> None:
    # ai_usage テーブルはテスト専用（本テストのみが書き込む）ため全消去で決定的にする。
    await conn.execute("DELETE FROM ai_usage")


def test_record_and_summarize_ai_usage() -> None:
    async def _run() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_ai_usage_schema(conn)
            await _clean(conn)
            await record_ai_usage(
                conn,
                user_id=TEST_USER,
                model="claude-sonnet-5",
                status="ok",
                status_code=200,
                prompt_chars=1200,
                completion_chars=300,
                duration_ms=1500,
                warnings=0,
            )
            await record_ai_usage(
                conn,
                user_id=TEST_USER,
                model="claude-sonnet-5",
                status="ok",
                status_code=200,
                prompt_chars=800,
                completion_chars=200,
                duration_ms=1200,
                warnings=1,
            )
            await record_ai_usage(
                conn,
                user_id=TEST_USER,
                model="claude-sonnet-5",
                status="rate_limited",
                status_code=429,
                prompt_chars=400,
            )
            summary = await summarize_ai_usage(conn, days=30)
            assert summary["status"] == "ok"
            total = summary["total"]
            assert total["calls"] == 3
            assert total["ok_calls"] == 2
            assert total["error_calls"] == 1
            assert total["prompt_chars"] == 2400
            assert total["completion_chars"] == 500
            assert total["duration_ms"] == 2700
            assert total["warnings"] == 1
            # 概算費用は 0 より大きい（出力 500 文字 = 125 トークン等の概算）。
            assert total["estimated_cost_usd"] > 0
            assert any(u["user"] == TEST_USER for u in summary["users"])
            assert any(d["calls"] == 3 for d in summary["daily"])
            # プロンプト本文を返却・保存しない。
            assert "PROMPT" not in str(summary)
        finally:
            await _clean(conn)
            await conn.close()

    asyncio.run(_run())


def test_ai_memo_records_usage_and_usage_api_returns_it(monkeypatch) -> None:
    """AI メモ生成（成功）が ai_usage に記録され、/api/v1/ai/usage で取得できる。"""
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        return "生成されたメモ（デモ）"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)

    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, database_url=TEST_DSN, anthropic_api_key="sk-ant-test"
    )

    async def _clean_conn() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await _clean(conn)
        finally:
            await conn.close()

    asyncio.run(_clean_conn())
    # ``with`` で lifespan を実行する（TestClient を直接使うとリクエストごとにイベント
    # ループが切り替わり、asyncpg プールが古いループにバインドされたままになるため）。
    with TestClient(app) as client:
        res = client.post(
            "/api/v1/ai/memo",
            json={"prompt": "デモ用プロンプト"},
            headers={"x-ocsrc-user": TEST_USER},
        )
        assert res.status_code == 200, res.text
        usage = client.get("/api/v1/ai/usage?days=30")
        assert usage.status_code == 200, usage.text
        body = usage.json()
        assert body["total"]["calls"] == 1
        assert body["total"]["ok_calls"] == 1
        assert body["total"]["error_calls"] == 0
        assert body["total"]["prompt_chars"] == len("デモ用プロンプト")
        # completion_chars はサーバー側で免責文が付加された後の文字数になる（>= 生成本文）。
        assert body["total"]["completion_chars"] >= len("生成されたメモ（デモ）")
        assert any(u["user"] == TEST_USER for u in body["users"])
        # プロンプト本文・API キーはレスポンスに含まれない。
        assert "デモ用プロンプト" not in usage.text
        assert "sk-ant" not in usage.text

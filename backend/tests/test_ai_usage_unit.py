"""AI 利用実績（評価書 #20）のユニットテスト。

概算費用の算出・スキーマ定義・DB 未設定時のエンドポイント挙動（503）を検証する。
DB を使う検証は test_ai_usage_db_integration.py（OCSRC_TEST_DATABASE_URL 必須）。
"""

import pytest
from fastapi.testclient import TestClient

from app.ai_usage import AI_USAGE_SCHEMA_SQL, estimate_cost_usd
from app.main import create_app
from app.settings import Settings, get_settings


def make_client(**overrides) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, **overrides)
    return TestClient(app)


def test_estimate_cost_usd_basic() -> None:
    # 4,000 文字入力 = 1,000 トークン入力・1,000 文字出力 = 250 トークン出力（概算）。
    # 0.001M * 3 + 0.00025M * 15 = 0.00675 USD（浮動小数点の丸めは許容）。
    assert estimate_cost_usd(4000, 1000) == pytest.approx(0.00675, abs=1e-4)


def test_estimate_cost_usd_zero_chars_is_zero() -> None:
    assert estimate_cost_usd(0, 0) == 0.0


def test_estimate_cost_usd_output_heavier_than_input() -> None:
    # 出力単価は入力単価の 5 倍（概算）のため、出力文字が多いほど高くなる。
    assert estimate_cost_usd(0, 4000) > estimate_cost_usd(4000, 0)


def test_schema_sql_is_additive_and_idempotent() -> None:
    assert "CREATE TABLE IF NOT EXISTS ai_usage" in AI_USAGE_SCHEMA_SQL
    # プロンプト本文を保存するカラムを持たない（監査方針: 本文非記録）。
    assert "prompt_text" not in AI_USAGE_SCHEMA_SQL
    assert "content" not in AI_USAGE_SCHEMA_SQL
    assert "prompt_chars" in AI_USAGE_SCHEMA_SQL


def test_ai_usage_endpoint_503_without_database() -> None:
    client = make_client(database_url=None)
    res = client.get("/api/v1/ai/usage")
    assert res.status_code == 503
    assert "not configured" in res.json()["detail"]


def test_ai_usage_endpoint_503_when_database_unreachable() -> None:
    # 到達不能な DSN でも「取得失敗」として 503 を返す（0 件と区別・NFR-504）。
    client = make_client(database_url="postgresql://nouser:nopass@127.0.0.1:1/nowhere")
    res = client.get("/api/v1/ai/usage")
    assert res.status_code == 503

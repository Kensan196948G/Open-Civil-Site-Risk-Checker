"""ハザード区域判定 API（Issue #112）の DB 統合テスト。

OCSRC_TEST_DATABASE_URL が設定されている場合のみ実行される（CI の PostGIS
サービス or ローカル PostGIS）。架空のサンプルポリゴン（sample-hazards.geojson）
を投入し、区域内判定・最寄り距離・境界直上・データ欠落地域・性能を検証する。
"""

import asyncio
import json
import os
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ksj import ensure_schema, parse_feature_collection, replace_features
from app.main import create_app
from app.settings import Settings, get_settings

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")
SAMPLE_DIR = Path(__file__).resolve().parents[1] / "data" / "sample"

pytestmark = pytest.mark.skipif(
    not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set (needs a PostGIS instance)"
)

HAZARD_SOURCE = "テスト取込（hazard・合成）"


def ingest_hazard_samples() -> None:
    async def _run() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_schema(conn)
            doc = json.loads((SAMPLE_DIR / "sample-hazards.geojson").read_text(encoding="utf-8"))
            features, rejects = parse_feature_collection(doc)
            assert not rejects, rejects
            await replace_features(
                conn,
                dataset="hazard",
                source=HAZARD_SOURCE,
                source_updated_at="テスト",
                features=features,
            )
        finally:
            await conn.close()

    asyncio.run(_run())


def make_client() -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, database_url=TEST_DSN
    )
    return TestClient(app)


# サンプルの区域:
#   浸水想定A: [139.748-139.756, 35.671-35.677]（霞が関より南西）
#   土砂災害B: [139.752-139.758, 35.674-35.680]（霞が関付近）
#   浸水想定C: [139.78-139.79, 35.69-35.70]（遠方）
LAT, LON = 35.6745, 139.7524  # 霞が関（サンプル合成の基準点）


def test_hazard_inside_and_nearby() -> None:
    ingest_hazard_samples()
    with make_client() as client:
        res = client.get(
            "/api/v1/hazard-assess", params={"lat": LAT, "lon": LON, "radius_m": 2000}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        ours = [i for i in body["inside"] + body["nearby"] if i["source"] == HAZARD_SOURCE]
        assert len(ours) >= 1
        # 霞が関は土砂災害警戒区域B の内側（[139.752-139.758, 35.674-35.680]）
        inside = [i for i in body["inside"] if i["source"] == HAZARD_SOURCE]
        assert any("土砂" in i["name"] for i in inside), inside
        assert all(i["hazard_type"] == "landslide" for i in inside if "土砂" in i["name"])


def test_hazard_outside_returns_distance() -> None:
    ingest_hazard_samples()
    # 区域C（[139.78-139.79, 35.69-35.70]）の外側・北東約35kmの地点
    # → inside は空、nearby に距離つき区域
    with make_client() as client:
        res = client.get(
            "/api/v1/hazard-assess",
            params={"lat": 36.0, "lon": 139.9, "radius_m": 50000},
        )
        assert res.status_code == 200
        body = res.json()
        ours = [i for i in body["nearby"] if i["source"] == HAZARD_SOURCE]
        # 50km 圏内に区域C（[139.78-139.79, 35.69-35.70]）が存在
        assert any("浸水" in i["name"] for i in ours), ours
        assert all(i["distance_m"] is not None and i["distance_m"] >= 0 for i in ours)


def test_hazard_empty_area_is_honest_zero() -> None:
    """データ欠落地域（該当区域なし）は空リストを返し、エラーにしない（NFR-504）。"""
    ingest_hazard_samples()
    # 日本の外・太平洋上 → どの区域にも該当しない
    with make_client() as client:
        res = client.get(
            "/api/v1/hazard-assess", params={"lat": 30.0, "lon": 150.0, "radius_m": 10000}
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["inside"] == []
        assert body["nearby"] == []


def test_hazard_endpoint_completes_within_threshold() -> None:
    """既存 test_ksj_db_integration の方式踏襲: 実用的な応答時間内に完了する（NFR-002）。"""
    ingest_hazard_samples()
    with make_client() as client:
        start = time.monotonic()
        res = client.get(
            "/api/v1/hazard-assess", params={"lat": LAT, "lon": LON, "radius_m": 5000}
        )
        elapsed = time.monotonic() - start
    assert res.status_code == 200
    assert elapsed < 2.0, f"hazard-assess took {elapsed:.3f}s"


def test_hazard_boundary_point() -> None:
    """区域境界直上（区域B の辺上）の地点を検証する。

    浮動小数点の都合で Contains が true/false どちらにもなり得るため、
    「エラーにならず 200 を返し、inside か nearby のいずれかに現れる」ことを
    検証する（境界直上は曖昧であり断定しない方針と整合）。
    """
    ingest_hazard_samples()
    # 区域B の左辺: lon=139.752, lat=35.677（辺の中央付近）
    with make_client() as client:
        res = client.get(
            "/api/v1/hazard-assess", params={"lat": 35.677, "lon": 139.752, "radius_m": 2000}
        )
        assert res.status_code == 200
        body = res.json()
        ours = [i for i in body["inside"] + body["nearby"] if i["source"] == HAZARD_SOURCE]
        assert len(ours) >= 1

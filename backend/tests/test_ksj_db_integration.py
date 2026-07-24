"""Integration tests against a real PostGIS instance.

Skipped unless OCSRC_TEST_DATABASE_URL is set. Locally:
    OCSRC_TEST_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker pytest
In CI the backend job provides a postgis service container.
"""

import asyncio
import json
import math
import os
import random
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.ksj import (
    ParsedFeature,
    ensure_schema,
    parse_feature_collection,
    replace_features,
)
from app.main import create_app
from app.settings import Settings, get_settings

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")
SAMPLE_DIR = Path(__file__).resolve().parents[1] / "data" / "sample"

pytestmark = pytest.mark.skipif(
    not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set (needs a PostGIS instance)"
)

# Kasumigaseki: ~200-400m from the synthetic sample geometries.
LAT, LON = 35.6745, 139.7524
SOURCE = "テスト取込（integration）"
PERF_SOURCE = "テスト取込（performance）"


def ingest_samples() -> None:
    async def _run() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_schema(conn)
            for filename, dataset in (
                ("sample-rivers.geojson", "river"),
                ("sample-facilities.geojson", "facility"),
            ):
                doc = json.loads((SAMPLE_DIR / filename).read_text(encoding="utf-8"))
                features, rejects = parse_feature_collection(doc)
                assert not rejects
                await replace_features(
                    conn,
                    dataset=dataset,
                    source=SOURCE,
                    source_updated_at="テスト",
                    features=features,
                )
        finally:
            await conn.close()

    asyncio.run(_run())


def make_client() -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, database_url=TEST_DSN)
    return TestClient(app)


def ingest_perf_dataset() -> None:
    """応答時間ベンチマークに使う 500 件規模の合成データを投入する。

    20 件を Kasumigaseki 中心 400m 圏内（ヒット対象）、480 件を Kasumigaseki
    から確実に離れた関東広域（ノイズ）に配置し、検索対象が全体に対して疎ら
    という実運用に近い状況を再現する。
    """

    async def _run() -> None:
        import asyncpg

        rng = random.Random(42)
        features: list[ParsedFeature] = []
        for i in range(20):
            angle = rng.uniform(0, 2 * math.pi)
            dist_m = rng.uniform(0, 400)  # 検索半径 500m に対して余裕を持たせる
            dlat = (dist_m * math.cos(angle)) / 111_000
            dlon = (dist_m * math.sin(angle)) / (111_000 * math.cos(math.radians(LAT)))
            features.append(
                ParsedFeature(
                    name=f"perf-hit-{i}",
                    geometry={"type": "Point", "coordinates": [LON + dlon, LAT + dlat]},
                )
            )
        for i in range(480):
            lat = rng.uniform(35.9, 36.5)  # Kasumigaseki から ~25km 以上離す
            lon = rng.uniform(139.0, 140.5)
            features.append(
                ParsedFeature(
                    name=f"perf-noise-{i}",
                    geometry={"type": "Point", "coordinates": [lon, lat]},
                )
            )

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_schema(conn)
            await replace_features(
                conn,
                dataset="facility",
                source=PERF_SOURCE,
                source_updated_at="perf-test",
                features=features,
            )
        finally:
            await conn.close()

    asyncio.run(_run())


def test_ingest_then_nearby_returns_items_with_distance() -> None:
    ingest_samples()
    with make_client() as client:
        res = client.get("/api/v1/nearby", params={"lat": LAT, "lon": LON, "radius_m": 2000})
        assert res.status_code == 200
        body = res.json()
        ours = [i for i in body["items"] if i["source"] == SOURCE]
        assert len(ours) == 4  # 2 rivers + 2 facilities
        assert {i["dataset"] for i in ours} == {"river", "facility"}
        # Ordered by distance, every distance within the requested radius.
        distances = [i["distance_m"] for i in body["items"]]
        assert distances == sorted(distances)
        ours_d = [i["distance_m"] for i in ours]
        assert all(0 <= d <= 2000 for d in ours_d), ours_d
        # Attribution and vintage survive the round-trip (NFR-301).
        assert all(i["source_updated_at"] == "テスト" for i in ours)


def test_reingest_is_idempotent_and_small_radius_excludes() -> None:
    ingest_samples()
    ingest_samples()  # replace, not append
    with make_client() as client:
        res = client.get("/api/v1/nearby", params={"lat": LAT, "lon": LON, "radius_m": 2000})
        ours = [i for i in res.json()["items"] if i["source"] == SOURCE]
        assert len(ours) == 4

        # 10m around the point: the synthetic features are hundreds of meters
        # away, so within-coverage emptiness is an honest zero (not an error).
        res_small = client.get("/api/v1/nearby", params={"lat": LAT, "lon": LON, "radius_m": 10})
        assert res_small.status_code == 200
        assert [i for i in res_small.json()["items"] if i["source"] == SOURCE] == []


def test_geom_gist_index_exists() -> None:
    """スキーマが GiST インデックス (ksj_features_geom_gix) を実際に作成する
    ことを pg_indexes カタログで確認する（要件 §6.1 / NFR-002 系）。

    行数に依存しないカタログ照会のため、EXPLAIN でのプランナ選択（小規模
    データでは Seq Scan の方が低コストと判断され Index Scan が選ばれない
    ことがある）とは独立して、インデックス定義そのものを検証できる。
    """

    async def _run() -> str | None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_schema(conn)
            return await conn.fetchval(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'ksj_features' AND indexname = 'ksj_features_geom_gix'"
            )
        finally:
            await conn.close()

    indexname = asyncio.run(_run())
    assert indexname == "ksj_features_geom_gix"


def test_nearby_endpoint_completes_within_threshold_at_scale() -> None:
    """500 件規模のデータに対しても /api/v1/nearby が実用的な時間内に応答する
    ことを検証する（要件 §6.1 / NFR-002 系の実測ベンチマーク）。

    500 件程度ではプランナが Seq Scan を選ぶことがあり得るため、インデックス
    使用の直接検証（test_geom_gist_index_exists）とは切り離し、ここでは
    「実際に速いか」という応答時間のみを厳密に検証する。
    """
    ingest_perf_dataset()

    with make_client() as client:
        start = time.monotonic()
        res = client.get("/api/v1/nearby", params={"lat": LAT, "lon": LON, "radius_m": 500})
        elapsed = time.monotonic() - start

    assert res.status_code == 200
    ours = [i for i in res.json()["items"] if i["source"] == PERF_SOURCE]
    assert len(ours) == 20  # ヒット対象として意図的に配置した件数と一致
    # 500 件規模の空間検索が実用的な時間内に完了すること。
    assert elapsed < 2.0, f"nearby query took {elapsed:.3f}s"

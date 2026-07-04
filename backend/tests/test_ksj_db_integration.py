"""Integration tests against a real PostGIS instance.

Skipped unless OCSRC_TEST_DATABASE_URL is set. Locally:
    OCSRC_TEST_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker pytest
In CI the backend job provides a postgis service container.
"""

import asyncio
import json
import os
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

# Kasumigaseki: ~200-400m from the synthetic sample geometries.
LAT, LON = 35.6745, 139.7524
SOURCE = "テスト取込（integration）"


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

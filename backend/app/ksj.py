"""KSJ (国土数値情報) local database: GeoJSON parsing, schema and spatial queries.

Design notes:
- Pure parsing/validation lives here so it can be unit-tested without a DB.
- Coordinates are WGS84 (NFR-501); out-of-range features are rejected, not
  silently clamped (NFR-505).
- Every stored feature keeps its attribution and vintage so findings can cite
  their evidence (NFR-301).
"""

import json
from dataclasses import dataclass, field
from typing import Any

DATASETS = ("river", "facility")

# Name resolution order: generic key first, then well-known KSJ attribute codes
# (W05_004 = river name, P02_003/P02_004 = facility name variants).
NAME_KEYS = ("name", "W05_004", "P02_004", "P02_003", "名称")

ALLOWED_GEOMETRY_TYPES = {
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
}

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ksj_features (
    id BIGSERIAL PRIMARY KEY,
    dataset TEXT NOT NULL,
    name TEXT NOT NULL,
    attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL,
    source_updated_at TEXT NOT NULL DEFAULT '',
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    geom GEOMETRY(GEOMETRY, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS ksj_features_geom_gix ON ksj_features USING GIST (geom);
CREATE INDEX IF NOT EXISTS ksj_features_dataset_ix ON ksj_features (dataset);
"""

NEARBY_SQL = """
SELECT dataset,
       name,
       attrs::text AS attrs_json,
       source,
       source_updated_at,
       retrieved_at,
       ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m
FROM ksj_features
WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
ORDER BY distance_m ASC
LIMIT $4
"""


@dataclass
class ParsedFeature:
    name: str
    geometry: dict[str, Any]
    attrs: dict[str, Any] = field(default_factory=dict)


def _iter_positions(coords: Any):
    """Yield [lon, lat] leaf positions from arbitrarily nested coordinates."""
    if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
        yield coords
        return
    if isinstance(coords, (list, tuple)):
        for c in coords:
            yield from _iter_positions(c)


def _coords_in_wgs84(geometry: dict[str, Any]) -> bool:
    positions = list(_iter_positions(geometry.get("coordinates")))
    if not positions:
        return False
    for pos in positions:
        if len(pos) < 2:
            return False
        lon, lat = pos[0], pos[1]
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            return False
    return True


def _resolve_name(props: dict[str, Any], name_key: str | None) -> str:
    keys = (name_key,) if name_key else NAME_KEYS
    for key in keys:
        if key and props.get(key):
            return str(props[key])
    return "（名称不明）"


def parse_feature_collection(
    doc: dict[str, Any], *, name_key: str | None = None
) -> tuple[list[ParsedFeature], list[str]]:
    """Parse a GeoJSON FeatureCollection into insertable features.

    Returns (accepted, rejects) where rejects are human-readable reasons —
    rejected features are reported, never silently dropped (FR-304 spirit).
    """
    accepted: list[ParsedFeature] = []
    rejects: list[str] = []

    if doc.get("type") != "FeatureCollection" or not isinstance(doc.get("features"), list):
        return [], ["not a GeoJSON FeatureCollection"]

    for i, feat in enumerate(doc["features"]):
        if not isinstance(feat, dict) or feat.get("type") != "Feature":
            rejects.append(f"feature[{i}]: not a Feature object")
            continue
        geom = feat.get("geometry")
        if not isinstance(geom, dict) or geom.get("type") not in ALLOWED_GEOMETRY_TYPES:
            rejects.append(f"feature[{i}]: unsupported or missing geometry")
            continue
        if not _coords_in_wgs84(geom):
            rejects.append(f"feature[{i}]: coordinates outside WGS84 range or empty")
            continue
        props = feat.get("properties") or {}
        if not isinstance(props, dict):
            props = {}
        accepted.append(
            ParsedFeature(name=_resolve_name(props, name_key), geometry=geom, attrs=props)
        )

    return accepted, rejects


async def ensure_schema(conn) -> None:
    await conn.execute(SCHEMA_SQL)


async def replace_features(
    conn,
    *,
    dataset: str,
    source: str,
    source_updated_at: str,
    features: list[ParsedFeature],
) -> int:
    """Idempotent ingest: replace all rows of (dataset, source), then insert."""
    if dataset not in DATASETS:
        raise ValueError(f"dataset must be one of {DATASETS}")
    async with conn.transaction():
        await conn.execute(
            "DELETE FROM ksj_features WHERE dataset = $1 AND source = $2", dataset, source
        )
        for f in features:
            await conn.execute(
                """
                INSERT INTO ksj_features (dataset, name, attrs, source, source_updated_at, geom)
                VALUES ($1, $2, $3::jsonb, $4, $5,
                        ST_SetSRID(ST_GeomFromGeoJSON($6), 4326))
                """,
                dataset,
                f.name,
                json.dumps(f.attrs, ensure_ascii=False),
                source,
                source_updated_at,
                json.dumps(f.geometry),
            )
    return len(features)


async def query_nearby(
    conn, *, lat: float, lon: float, radius_m: float, limit: int = 100
) -> list[dict]:
    rows = await conn.fetch(NEARBY_SQL, lat, lon, radius_m, limit)
    items: list[dict] = []
    for r in rows:
        items.append(
            {
                "dataset": r["dataset"],
                "name": r["name"],
                "attrs": json.loads(r["attrs_json"]),
                "source": r["source"],
                "source_updated_at": r["source_updated_at"],
                "retrieved_at": r["retrieved_at"].isoformat(),
                "distance_m": round(float(r["distance_m"]), 1),
            }
        )
    return items

import json
from pathlib import Path

from app.ksj import parse_feature_collection

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "data" / "sample"


def load(name: str) -> dict:
    return json.loads((SAMPLE_DIR / name).read_text(encoding="utf-8"))


def test_parse_sample_rivers() -> None:
    features, rejects = parse_feature_collection(load("sample-rivers.geojson"))
    assert rejects == []
    assert [f.name for f in features] == ["サンプル川（テスト用）", "サンプル水路（テスト用）"]
    assert features[0].geometry["type"] == "LineString"


def test_parse_sample_facilities() -> None:
    features, rejects = parse_feature_collection(load("sample-facilities.geojson"))
    assert rejects == []
    assert len(features) == 2
    assert all(f.geometry["type"] == "Point" for f in features)


def test_rejects_non_feature_collection() -> None:
    features, rejects = parse_feature_collection({"type": "Feature"})
    assert features == []
    assert rejects == ["not a GeoJSON FeatureCollection"]


def test_rejects_out_of_range_coordinates() -> None:
    doc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"name": "範囲外"},
                # lat 95 is outside WGS84 — must be rejected, not clamped (NFR-505).
                "geometry": {"type": "Point", "coordinates": [139.75, 95.0]},
            },
            {
                "type": "Feature",
                "properties": {"name": "正常"},
                "geometry": {"type": "Point", "coordinates": [139.75, 35.67]},
            },
        ],
    }
    features, rejects = parse_feature_collection(doc)
    assert [f.name for f in features] == ["正常"]
    assert len(rejects) == 1 and "WGS84" in rejects[0]


def test_name_key_override_and_fallback() -> None:
    doc = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"W05_004": "多摩川", "name": "generic"},
                "geometry": {"type": "Point", "coordinates": [139.0, 35.0]},
            },
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": [139.0, 35.0]},
            },
        ],
    }
    features, _ = parse_feature_collection(doc, name_key="W05_004")
    assert features[0].name == "多摩川"
    # No usable key at all -> explicit placeholder, never silently empty.
    assert features[1].name == "（名称不明）"

import argparse
import asyncio
import json
from pathlib import Path

import pytest

from app import ingest
from app.settings import Settings


def test_build_parser_requires_dataset_and_source() -> None:
    parser = ingest.build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["file.geojson"])  # missing --dataset/--source


def test_build_parser_accepts_valid_args(tmp_path: Path) -> None:
    f = tmp_path / "x.geojson"
    args = ingest.build_parser().parse_args(
        [str(f), "--dataset", "river", "--source", "テスト出典", "--name-key", "W05_004"]
    )
    assert args.dataset == "river"
    assert args.source == "テスト出典"
    assert args.name_key == "W05_004"
    assert args.database_url is None


def test_run_without_database_url_returns_2(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # No --database-url and no configured settings -> must fail fast (exit 2)
    # without ever reading the input file (order of checks matters).
    monkeypatch.setattr(ingest, "get_settings", lambda: Settings(_env_file=None, database_url=None))
    args = argparse.Namespace(
        file=tmp_path / "does-not-exist.geojson",
        dataset="river",
        source="テスト",
        source_updated="",
        name_key=None,
        database_url=None,
    )
    assert asyncio.run(ingest.run(args)) == 2


def test_run_with_no_valid_features_returns_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A database URL is present, but the file has zero valid features ->
    # must fail (exit 1) before ever attempting a DB connection.
    monkeypatch.setattr(
        ingest,
        "get_settings",
        lambda: Settings(_env_file=None, database_url="postgresql://unused/unused"),
    )
    f = tmp_path / "empty.geojson"
    f.write_text(json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf-8")
    args = argparse.Namespace(
        file=f,
        dataset="river",
        source="テスト",
        source_updated="",
        name_key=None,
        database_url=None,
    )
    assert asyncio.run(ingest.run(args)) == 1

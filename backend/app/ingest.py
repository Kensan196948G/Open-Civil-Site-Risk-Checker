"""KSJ GeoJSON ingest CLI.

Usage (inside backend/, with OCSRC_DATABASE_URL set or --database-url given):

    python -m app.ingest data/sample/sample-rivers.geojson \
        --dataset river --source "サンプル河川データ（テスト用）" --source-updated "2026"

Re-running with the same (dataset, source) replaces previous rows (idempotent).
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from .ksj import DATASETS, ensure_schema, parse_feature_collection, replace_features
from .settings import get_settings


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ingest a KSJ GeoJSON file into PostGIS")
    p.add_argument("file", type=Path, help="GeoJSON FeatureCollection file")
    p.add_argument("--dataset", required=True, choices=DATASETS)
    p.add_argument(
        "--source", required=True, help="attribution text, e.g. 国土数値情報 河川データ（W05）"
    )
    p.add_argument("--source-updated", default="", help="data vintage, e.g. 2021年度")
    p.add_argument("--name-key", default=None, help="property key holding the feature name")
    p.add_argument("--database-url", default=None, help="overrides OCSRC_DATABASE_URL")
    return p


async def run(args: argparse.Namespace) -> int:
    database_url = args.database_url or get_settings().database_url
    if not database_url:
        print(
            "error: no database URL (set OCSRC_DATABASE_URL or pass --database-url)",
            file=sys.stderr,
        )
        return 2

    doc = json.loads(args.file.read_text(encoding="utf-8"))
    features, rejects = parse_feature_collection(doc, name_key=args.name_key)
    for reason in rejects:
        print(f"reject: {reason}", file=sys.stderr)
    if not features:
        print("error: no valid features to ingest", file=sys.stderr)
        return 1

    import asyncpg

    conn = await asyncpg.connect(dsn=database_url)
    try:
        await ensure_schema(conn)
        inserted = await replace_features(
            conn,
            dataset=args.dataset,
            source=args.source,
            source_updated_at=args.source_updated,
            features=features,
        )
    finally:
        await conn.close()

    print(f"ingested: {inserted} feature(s) (dataset={args.dataset}, rejected={len(rejects)})")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())

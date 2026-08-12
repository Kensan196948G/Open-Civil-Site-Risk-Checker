# OCSRC Backend（FastAPI / Phase 2）

工事候補地リスクチェッカーのバックエンド API（Phase 2 scaffold）。国土数値情報のローカル DB 化（PostGIS）と空間検索 API をここに実装していきます（Issue #4）。

## 開発

```bash
cd backend
python -m venv .venv
. .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

uvicorn app.main:app --reload  # http://127.0.0.1:8000
pytest                         # ユニットテスト
ruff check .                   # Lint
```

## エンドポイント

| Method | Path | 内容 |
|---|---|---|
| GET | `/livez` | liveness（プロセス生存のみ、DB 非依存） |
| GET | `/readyz` | readiness（DB 到達性込み。異常時は 503） |
| GET | `/healthz` | `/readyz` の後方互換エイリアス（異常時は 503） |
| GET | `/api/v1/ping` | API 疎通確認 |
| GET | `/api/v1/nearby?lat=&lon=&radius_m=` | 取込済み KSJ（河川・施設）の近傍検索。距離昇順・出典/整備年度つき。DB 未整備時は 503（「該当なし」と「取得失敗」を区別、NFR-504） |

## KSJ データ取込

```bash
OCSRC_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker \
  python -m app.ingest data/sample/sample-rivers.geojson \
  --dataset river --source "サンプル河川データ（テスト用）" --source-updated "2026（合成）"
```

同一 `(dataset, source)` の再実行は洗い替え（冪等）。実データの入手・変換手順は [`data/README.md`](data/README.md) を参照。

## 設定（環境変数、prefix `OCSRC_`）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `OCSRC_APP_ENV` | `development` | 実行環境名 |
| `OCSRC_DATABASE_URL` | なし | PostgreSQL DSN（例: `postgresql://app:***@db:5432/site_risk_checker`）。未設定なら DB チェックをスキップ |
| `OCSRC_DB_CHECK_TIMEOUT_SECONDS` | `20.0` | readiness の DB チェックタイムアウト（Neon autosuspend 後の cold start を許容・Issue #238） |

## Docker（PostGIS つき）

```bash
cd infra
cp .env.example .env   # パスワードを変更（コミット禁止）
docker compose --profile phase2 up -d --build
curl http://127.0.0.1:8000/livez     # → {"status":"ok","version":"0.2.0",...}
curl http://127.0.0.1:8000/readyz    # → {"status":"ok","db":"ok",...}（DB 異常時は 503）
```

既定の `docker compose up`（フロント配信 `ocsrc-web` のみ）には影響しません。

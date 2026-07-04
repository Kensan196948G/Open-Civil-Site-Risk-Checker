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
| GET | `/healthz` | liveness + DB 到達性（`ok` / `error` / `not_configured` / `unavailable`） |
| GET | `/api/v1/ping` | API 疎通確認 |

## 設定（環境変数、prefix `OCSRC_`）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `OCSRC_APP_ENV` | `development` | 実行環境名 |
| `OCSRC_DATABASE_URL` | なし | PostgreSQL DSN（例: `postgresql://app:***@db:5432/site_risk_checker`）。未設定なら DB チェックをスキップ |
| `OCSRC_DB_CHECK_TIMEOUT_SECONDS` | `3.0` | healthz の DB チェックタイムアウト |

## Docker（PostGIS つき）

```bash
cd infra
cp .env.example .env   # パスワードを変更（コミット禁止）
docker compose --profile phase2 up -d --build
curl http://127.0.0.1:8000/healthz   # → {"status":"ok","db":"ok",...}
```

既定の `docker compose up`（フロント配信 `ocsrc-web` のみ）には影響しません。

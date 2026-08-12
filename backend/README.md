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
| GET | `/api/v1/geocode?q=` | Nominatim `/search` プロキシ（ブラウザから同一オリジンで利用。1 req/sec をプロセス単位で遵守） |
| GET | `/api/v1/reverse-geocode?lat=&lon=` | Nominatim `/reverse` プロキシ |
| GET | `/api/v1/ai/status` | AI ブローカー設定状態（`configured` / `model` のみ。API キーは返さない） |
| POST | `/api/v1/ai/memo` | AI 調査メモ生成ブローカー。キーはサーバー側のみ。プロンプト本文は監査ログへ出力しない |

### AI ブローカー（Anthropic）

ブラウザは Anthropic API キーを保持・送信せず、本 API を経由する。設定変数は次のとおり（値はサーバー環境変数のみ・コミット禁止）。

| 変数 | 既定値 | 説明 |
|---|---|---|
| `OCSRC_ANTHROPIC_API_KEY` | なし | Anthropic API キー（`configure-ai-key.sh` で設定推奨） |
| `OCSRC_ANTHROPIC_MODEL` | `claude-sonnet-5` | 利用モデル |
| `OCSRC_ANTHROPIC_TIMEOUT_SECONDS` | `90.0` | 上流 API のタイムアウト |
| `OCSRC_ANTHROPIC_MAX_PROMPT_CHARS` | `20000` | プロンプト最大長（Pydantic 検証） |
| `OCSRC_ANTHROPIC_RATE_LIMIT_PER_WINDOW` | `10` | 固定窓あたりの最大呼出数 |
| `OCSRC_ANTHROPIC_RATE_LIMIT_WINDOW_SECONDS` | `60.0` | レート制限窓（秒） |
| `OCSRC_ANTHROPIC_MAX_CONCURRENCY` | `2` | 同時実行上限 |

応答にはサーバー側で免責文の付与・断定表現の検出（`warnings`）が入り、利用は監査ログ（`ai_audit`）へ記録される。監査ログは `X-OCSRC-User`（web 層が Access JWT 検証後に付与する内部ヘッダ）でユーザーを識別し、プロンプト本文は記録しない。

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

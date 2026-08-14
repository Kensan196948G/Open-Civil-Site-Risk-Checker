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
| GET | `/api/v1/hazard-assess?lat=&lon=&radius_m=` | ハザード区域判定（Issue #112）。浸水想定（A31）・土砂災害警戒（A33）相当のポリゴン（dataset=`hazard`）に対して `ST_Contains` の区域内判定と `ST_Distance` の最寄り距離を返す。データ欠落地域は空リスト（該当なし）、DB 未到達は 503 |
| GET | `/api/v1/data-sources` | データソース台帳（Issue #174・サーバ側永続化）。`data_sources` / `data_source_refreshes` テーブルから各ソースのメタ情報と再取込履歴を返す。feature flag `OCSRC_DATA_SOURCE_STORE_ENABLED`（既定 false）有効時のみ応答 |
| GET | `/api/v1/geocode?q=` | Nominatim `/search` プロキシ（ブラウザから同一オリジンで利用。1 req/sec をプロセス単位で遵守） |
| GET | `/api/v1/reverse-geocode?lat=&lon=` | Nominatim `/reverse` プロキシ |
| GET | `/api/v1/ai/status` | AI ブローカー設定状態（`configured` / `model` のみ。API キーは返さない） |
| POST | `/api/v1/ai/memo` | AI 調査メモ生成ブローカー。キーはサーバー側のみ。プロンプト本文は監査ログへ出力しない |
| GET | `/api/v1/ai/usage?days=` | AI 利用実績の集計（評価書 #20）。`ai_usage` テーブルの合計・日別・ユーザー別・概算費用を返す。DB 未設定・未到達は 503（「0 件」と区別） |
| GET | `/api/v1/cases` | 案件一覧（viewer 以上・案件台帳が有効な場合のみ） |
| POST | `/api/v1/cases` | 案件作成（editor 以上） |
| GET | `/api/v1/cases/{id}` | 案件詳細（viewer 以上） |
| PATCH | `/api/v1/cases/{id}` | 案件更新（editor 以上・approved は admin のみ） |
| POST | `/api/v1/cases/{id}/submit` | 承認申請へ遷移（draft→submitted、editor 以上） |
| POST | `/api/v1/cases/{id}/approve` | 承認（submitted→approved、approver 以上） |
| DELETE | `/api/v1/cases/{id}` | 案件削除（admin のみ。監査ログは残す） |
| GET | `/api/v1/audit` | 監査ログ閲覧（auditor 以上） |

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

AI 呼び出しは監査ログ（`ai_audit`・stdout）に加えて **`ai_usage` テーブル（additive migration・DB 設定時のみ best-effort）** へ記録され、`GET /api/v1/ai/usage` で直近 N 日の利用実績（呼び出し数・成功/失敗・文字数・概算費用・ユーザー別）を集計できる。プロンプト本文は記録しない。費用は概算（トークン≈文字数/4・入力/出力別単価は `app/ai_usage.py` の定数）。

## 案件台帳・RBAC・監査ログ（Issue #111）

案件データをサーバー側（PostgreSQL `cases` / `audit_log` テーブル）に永続化し、RBAC と承認ワークフローを提供する。**feature flag `OCSRC_CASE_STORE_ENABLED`（既定 `false`）が有効な場合のみ応答**し、無効時は全案件 API が 503 を返す（本番に無影響のまま preview/dev で検証できる）。

- **認証**: web 層（server.mjs）が Cloudflare Access JWT を検証後に付与する `X-OCSRC-User` 内部ヘッダを actor として使用（クライアント直送分は web 層で除去）。
- **RBAC**: `viewer / editor / approver / admin / auditor` の5ロール。ロールは環境変数（カンマ区切りユーザー識別子）で割り当て、未割当ユーザーは viewer。上位ロールは下位ロールの権限を含む。
- **承認ワークフロー**: `draft → submitted → approved` の最小状態遷移。approved 案件の更新は admin のみ。
- **監査ログ**: `case_created / case_submitted / case_approved / case_updated / case_deleted` を `audit_log` に追記（actor・時刻・対象・action。本文・秘密情報は記録しない）。

| 変数 | 既定値 | 説明 |
|---|---|---|
| `OCSRC_CASE_STORE_ENABLED` | `false` | 案件台帳 API の有効化（本番は既定のまま維持推奨） |
| `OCSRC_CASE_ADMIN_USERS` | 空 | admin ロールのユーザー識別子（カンマ区切り） |
| `OCSRC_CASE_APPROVER_USERS` | 空 | approver ロールのユーザー識別子（カンマ区切り） |
| `OCSRC_CASE_EDITOR_USERS` | 空 | editor ロールのユーザー識別子（カンマ区切り） |
| `OCSRC_CASE_AUDITOR_USERS` | 空 | auditor ロールのユーザー識別子（カンマ区切り） |

スキーマは `app/cases.py` の `CASE_SCHEMA_SQL` が `CREATE TABLE IF NOT EXISTS` で冪等作成する（既存 `ksj_features` に非干渉の additive migration）。ローカル検証例:

```bash
OCSRC_CASE_STORE_ENABLED=true \
OCSRC_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker \
OCSRC_CASE_ADMIN_USERS=admin@example.com \
OCSRC_CASE_EDITOR_USERS=editor@example.com \
  uvicorn app.main:app
```

## データソース台帳（Issue #174・サーバ側永続化）

`data_sources`（各ソースのメタ情報: 名称・提供元・ライセンス・元データ更新日・利用条件メモ・最終取得日時）と
`data_source_refreshes`（再取込履歴・追記型）を PostgreSQL に永続化する。**feature flag
`OCSRC_DATA_SOURCE_STORE_ENABLED`（既定 `false`）が有効な場合のみ応答**し、無効時は 503
（本番無影響のまま preview/dev で検証できる）。

- **API**: `GET /api/v1/data-sources` — 台帳一覧 + 再取込履歴（ソースごとに集約）
- **seed**: `python -m app.seed_demo_cases --with-sources` でデモ用の架空台帳（7ソース）と再取込履歴を投入（冪等・実在情報なし）
- **スキーマ**: `app/data_sources.py` の `DATA_SOURCE_SCHEMA_SQL` が冪等作成（既存テーブルに非干渉）

| 変数 | 既定値 | 説明 |
|---|---|---|
| `OCSRC_DATA_SOURCE_STORE_ENABLED` | `false` | データソース台帳 API の有効化（本番は既定のまま維持推奨） |

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

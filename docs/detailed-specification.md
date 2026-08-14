# Open Civil Site Risk Checker 詳細仕様設計書

## 1. 文書情報

| 項目 | 内容 |
|---|---|
| システム名 | Open Civil Site Risk Checker |
| 日本語名 | 工事候補地リスク自動チェックシステム |
| リポジトリ | `Open-Civil-Site-Risk-Checker` |
| リポジトリURL | `https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker.git` |
| 文書種別 | 詳細仕様設計書 |
| 版数 | v1.2 |
| 作成日 | 2026-06-18 |
| 最終更新日 | 2026-07-31 |
| 前提文書 | `docs/requirements.md` |

### 1.1 変更履歴

| 版数 | 日付 | 変更概要 |
|---|---|---|
| v1.0 | 2026-06-18 | 初版（バックエンド中心の構想設計） |
| v1.1 | 2026-07-11 | 実装実態（フロントエンド中心 SPA + KSJ 空間検索補助バックエンド）へ同期。バックエンド中心構想は将来計画（§3.4 等）として分離。運用境界（無認証・HTTP 平文の設計判断）を明文化（Issue #37）。KSJ バックエンド接続の same-origin 既定化（Issue #57）を反映 |
| v1.2 | 2026-07-31 | 本番運用実態へ同期: インターネット公開経路（Cloudflare Tunnel + Access、`ocsrc-tunnel`）、本番 DB の Neon PostgreSQL 移行、死活監視（`ocsrc-watchdog.timer`、PR #110）を §3・§9・§15.2 へ反映 |

---

## 2. 設計方針

### 2.1 基本設計方針

本システムは、住所または緯度経度を入力し、複数の公開API・公開GISデータから地点周辺情報を収集し、工事候補地の初期確認に使えるリスク一覧とAI調査メモを生成するWebアプリケーションである。

設計上の最重要方針は以下である。

1. 判定を断定しない。
2. 「データなし」を「リスクなし」と扱わない。
3. すべての結果に根拠・出典・取得日時を持たせる。
4. 外部APIの停止や遅延を前提に、部分結果表示を可能にする。
5. データソースはアダプタ方式で追加可能にする。
6. 将来的に `Global Civil API Catalog` や `Civil Open Data Intelligence Platform` と連携可能な構造にする。

### 2.2 判定表現ルール

| 禁止表現 | 代替表現 |
|---|---|
| 安全 | 追加確認事項は限定的 |
| 危険 | 専門確認優先 |
| 問題なし | 公開データ上の該当情報なし |
| 施工可能 | 施工条件の詳細確認が必要 |
| 施工不可 | 関係資料・専門部署への確認が必要 |
| リスクなし | 該当データなし、またはデータ不足 |

### 2.3 実装形態の設計判断（v1.1 追記）

MVP（Phase 1〜3）は**フロントエンド中心（クライアント完結）設計**を意図的に採用した。

| 判断 | 理由 |
|---|---|
| リスク判定・AIメモ・レポート生成をブラウザ内 TypeScript で実装 | 扱うデータが公開オープンデータのみで、サーバ側に秘匿すべき業務ロジック・個人情報がない。サーバレスで配布・検証が容易 |
| 利用者データはブラウザの `localStorage` のみに保存 | サーバ側 DB・ユーザー管理を持たないことで、機微情報（候補地住所等）を運営側が預からない |
| 外部公開 API はブラウザから直接 fetch | いずれも認証不要・CORS 開放の公開 API であり、中継サーバを挟む必然性がない（利用ポリシーは遵守） |
| バックエンド（FastAPI + PostGIS）は KSJ 空間検索の補助に限定 | 国土数値情報は事前ダウンロード・ローカル DB 化が必要（NFR-004）なため、この部分のみサーバ側に置く |

この判断に伴い、v1.0 で構想した認証・認可・サーバ側 DB・サーバ側ログ等は **MVP スコープ外**となる（§15.4 参照）。バックエンド中心構成は将来計画（§3.4）として保持する。

---

## 3. システム全体構成

### 3.1 実装アーキテクチャ（現行・正）

現行実装は、**SPA（Single Page Application）がブラウザ内で取得・判定・出力まで完結**し、バックエンドは国土数値情報（KSJ）の空間検索補助のみを担う。

```text
[利用者ブラウザ（信頼 LAN 内）]
  │  SPA（React + TypeScript + Vite）
  │   - 入力検証・地図表示（Leaflet + 地理院タイル）
  │   - データ取得オーケストレーション（src/api/runAnalysis.ts、並行取得・部分結果）
  │   - 確認優先度判定（src/api/* 各アダプタ）
  │   - AI 調査メモ生成（src/risk/memo.ts、断定表現チェック）
  │   - レポート生成（src/report/markdown.ts / csv.ts）
  │   - 永続化: ブラウザ localStorage のみ（案件・設定。AI API キーはサーバー側管理）
  │
  ├─(A) HTTPS 直接 fetch ────────► [外部公開 API 群]（認証不要・読み取り専用）
  │       Nominatim（住所検索）/ Overpass（道路・水域・施設）/
  │       Open-Meteo（気象・標高）/ 地理院タイル・標高 API /
  │       ハザードマップポータル（タイル）/ 気象庁 警報・注意報 /
  │       （AI メモ生成はサーバー側ブローカー経由・ブラウザから Anthropic へは送信しない）
  │
  └─(B) HTTP :8700 ──► [ocsrc-web]  frontend/server.mjs（systemd 常駐, 0.0.0.0:8700）
                          - Vite ビルド成果物（dist/）の静的配信
                          - セキュリティヘッダ付与（CSP / X-Frame-Options 等）
                          - /api/* same-origin プロキシ（GET/HEAD 基本。AI ブローカー /api/v1/ai/* のみ POST 可）
                          - 公開経路では Cloudflare Access JWT を検証
                               │  OCSRC_BACKEND_ORIGIN（既定 http://127.0.0.1:8000）
                               ▼
                       [ocsrc-api]  FastAPI（systemd 常駐, 127.0.0.1:8000・LAN 非公開）
                          - GET /livez / /readyz / /api/v1/ping / /api/v1/nearby
                          - GET /api/v1/ai/status / POST /api/v1/ai/memo（AI ブローカー）
                               │  OCSRC_DATABASE_URL（TLS）
                               ▼
                       [Neon PostgreSQL + PostGIS]（本番・マネージド）
                          - ksj_features（国土数値情報 DB）
                          ※ ローカル開発は docker compose の PostGIS（127.0.0.1:5432）

[インターネット利用者ブラウザ]
  └─(C) HTTPS ──► [Cloudflare edge]  TLS 終端 + Cloudflare Access（認証）
                        │  Tunnel（outbound 接続・受信ポート開放なし）
                        ▼
                  [ocsrc-tunnel]  cloudflared（systemd 常駐）──► ocsrc-web（:8700）

[監視] ocsrc-watchdog.timer（systemd, 5 分間隔・インシデント集約）
  - systemd 3 サービス / web healthz / api readiness（/readyz・再試行つき）/ 公開 URL エッジ応答を確認
  - 異常時はラベル watchdog の GitHub Issue を 1 障害 1 Issue で起票（コメント 30 分抑制）、連続 2 回 OK でクローズ
```

### 3.2 現行構成の要素

| 要素 | 実装 | 役割 |
|---|---|---|
| フロントエンド | React + TypeScript + Vite（`frontend/src/`） | 画面（SCR-000〜008）、外部 API 直接取得、確認優先度判定、AI メモ、レポート生成 |
| 配信サーバ | `frontend/server.mjs`（依存ゼロ Node.js、systemd `ocsrc-web`） | 静的配信、セキュリティヘッダ、`/api/*` same-origin プロキシ |
| バックエンド API | FastAPI（`backend/app/`、systemd `ocsrc-api`） | KSJ 空間検索（`/api/v1/nearby`）、ヘルスチェック。**127.0.0.1 バインドで LAN へ直接露出しない** |
| 空間 DB | PostgreSQL + PostGIS（**本番: Neon マネージド** / ローカル開発: docker compose `--profile phase2`） | KSJ 取込データ（`ksj_features`）、`ST_DWithin` 近傍検索 |
| データ取込 | `python -m app.ingest`（CLI） | KSJ GeoJSON を PostGIS へ取込（冪等・洗い替え） |
| 公開トンネル | `cloudflared`（systemd `ocsrc-tunnel`） | Cloudflare Tunnel による outbound 接続でエッジと接続（受信ポート開放なし）。エッジ側で TLS 終端 + Cloudflare Access 認証 |
| 死活監視 | `scripts/ocsrc-watchdog.sh`（systemd `ocsrc-watchdog.timer`、5 分間隔） | systemd 3 サービス・web healthz・api readiness（`/readyz`）・公開 URL を監視し、異常をラベル `watchdog` の GitHub Issue へ**インシデント集約**で起票（`docs/deploy-backend.md` §5） |
| 永続化（利用者データ） | ブラウザ `localStorage` | 調査案件・システム設定。AI API キーはサーバー側のみで管理（外部評価 Phase 0） |

### 3.3 通信経路と公開範囲

| 経路 | プロトコル | 公開範囲 | 備考 |
|---|---|---|---|
| ブラウザ → ocsrc-web（:8700） | HTTP | 信頼 LAN 内 | §15.2 運用境界参照。WAN からポート 8700 へは到達不可を維持。本番は Access JWT 必須（外部評価 #240） |
| ブラウザ → Cloudflare edge → ocsrc-tunnel → ocsrc-web | HTTPS | インターネット（Cloudflare Access 認証必須） | エッジで TLS 終端 + Access 認証。`frontend/server.mjs` が Access JWT を検証し、JWT/cookie はバックエンドへ転送しない |
| ブラウザ → 外部公開 API | HTTPS | インターネット | CSP `connect-src` / `img-src` の許可リストで制限 |
| ocsrc-web → ocsrc-api | HTTP（ループバック） | 同一ホスト内のみ | `/api/*` same-origin プロキシ。転送先は環境変数固定（SSRF 防止） |
| ocsrc-api → PostgreSQL | TLS（本番: Neon） | 外向き接続のみ | DB 資格情報は `/etc/ocsrc/api.env`（root:root, 600）で管理。ローカル開発はループバックの docker PostGIS |

KSJ 連携（経路 B）は**既定で有効**である（Issue #57）。バックエンド base の解決順位は「① SCR-008 のカスタム URL（`localStorage`） > ② ビルド時 `VITE_OCSRC_BACKEND_URL` > ③ `''`（same-origin 既定）」で、③のときは相対パス（`/api/v1/...`）として配信オリジンの `/api` プロキシ経由で到達する（LAN 上の別端末のブラウザでも追加設定不要）。バックエンド停止・DB 未整備時は「取得失敗（failed）」として誠実に表示し、「該当なし」と区別する（NFR-504）。なお経路 A（外部公開 API）のみでもアプリの他機能は完結する。

### 3.4 将来構想: バックエンド中心構成（Phase 4+ 計画）

> ⚠️ **本節以降の「バックエンド中心構成」は v1.0 の構想であり、現行実装ではない。** 複数候補地比較・案件管理・社内レビュー（Phase 4）や `Civil Open Data Intelligence Platform` 統合（Phase 5）でサーバ側の案件 DB・認証・監査が必要になった段階で再評価する。

```text
[Browser]
  |
  | HTTPS
  v
[Web Frontend]
  - 地点入力
  - 地図表示
  - リスク一覧
  - AI調査メモ
  |
  | REST API / JSON
  v
[Backend API]
  - 認証・認可
  - ジオコーディング
  - データ取得制御
  - リスク確認ロジック
  - AIメモ生成
  - レポート生成
  |
  +--> [API Adapter Layer]
  |      - OSM / Nominatim Adapter
  |      - OSM / Overpass Adapter
  |      - Open-Meteo Adapter
  |      - 国土数値情報 Adapter
  |      - Hazard Map Adapter
  |      - GSI Tile Adapter
  |      - PLATEAU Adapter
  |      - xROAD Adapter
  |
  +--> [PostgreSQL + PostGIS]
  |      - 地点検索履歴
  |      - 取得結果
  |      - リスク確認結果
  |      - データソース台帳
  |      - API接続ログ
  |
  +--> [Cache / Queue]
         - APIレスポンスキャッシュ
         - 非同期取得ジョブ
```

#### 将来構想時の技術候補（v1.0 から継承）

| 項目 | 候補 |
|---|---|
| フロントエンド | Next.js / React |
| API | FastAPI |
| DB | Azure Database for PostgreSQL + PostGIS |
| 認証 | Entra ID / OIDC |
| シークレット管理 | Azure Key Vault または環境変数管理 |
| 監視 | Azure Monitor / Application Insights 相当 |
| CI/CD | GitHub Actions |
| コンテナ | Docker / Docker Compose |

---

## 4. リポジトリ構成（現行）

```text
Open-Civil-Site-Risk-Checker/
├── README.md
├── docs/
│   ├── requirements.md              # 要件定義書（正本）
│   ├── detailed-specification.md    # 本書（正本）
│   ├── overview.md                  # 概要
│   ├── deploy-backend.md            # バックエンド本番デプロイ手順
│   └── site-risk-checker.design.dc.html  # デザインプロトタイプ
├── frontend/
│   ├── package.json
│   ├── server.mjs                   # 本番静的配信 + /api same-origin プロキシ
│   ├── scripts/                     # esbuild スモークテストランナー
│   └── src/
│       ├── api/                     # ★外部 API アダプタ層（ブラウザ直 fetch）
│       ├── risk/                    # AI 調査メモ生成（断定表現チェック）
│       ├── report/                  # Markdown / CSV レポート生成
│       ├── map/                     # Leaflet 地図
│       ├── data/                    # 定数・ソース台帳・サンプル案件
│       ├── settings/                # SCR-008 システム設定（localStorage）
│       ├── components/ screens/     # UI 部品・各画面（SCR-000〜008）
│       └── store.tsx types.ts ほか
├── backend/
│   ├── pyproject.toml / requirements.txt / requirements-dev.txt
│   ├── app/
│   │   ├── main.py                  # FastAPI（healthz / ping / nearby）
│   │   ├── settings.py              # OCSRC_ 環境変数（pydantic-settings）
│   │   ├── db.py                    # asyncpg 接続プール・ヘルスチェック
│   │   ├── ksj.py                   # KSJ GeoJSON パース・スキーマ・空間検索
│   │   └── ingest.py                # KSJ 取込 CLI（python -m app.ingest）
│   ├── data/                        # 取込手順（README）・サンプル GeoJSON
│   └── tests/                       # pytest（PostGIS 統合テスト含む）
├── infra/
│   ├── docker-compose.yml           # ocsrc-web（既定）/ db + backend（--profile phase2）
│   ├── Dockerfile / Dockerfile.backend
│   └── .env.example                 # DB 資格情報の雛形（実 .env はコミット禁止）
└── scripts/
    ├── install-systemd.sh / uninstall-systemd.sh          # フロント常駐（ocsrc-web）
    ├── install-systemd-api.sh / uninstall-systemd-api.sh  # API 常駐（ocsrc-api）
    └── ops/                         # 運用補助スクリプト
```

> v1.0 のリポジトリ構成案（`backend/app/routers/` `services/` `adapters/` 等のバックエンド中心構成）は §3.4 の将来構想時に再検討する。

---

## 5. 主要モジュール仕様

### 5.1 フロントエンドモジュール（実装済み）

| モジュール | 実装 | 内容 |
|---|---|---|
| 地点入力（SCR-001） | `src/screens/` | 住所・緯度経度・半径・カテゴリ入力、入力検証 |
| 地図表示 | `src/map/SiteMap.tsx` | Leaflet + 地理院タイル、地点・検索半径・実ジオメトリ・ハザードタイル重ね合わせ |
| 取得オーケストレーション | `src/api/runAnalysis.ts` | 各アダプタの並行実行、部分結果、成功/失敗/スキップの区別 |
| アダプタ層 | `src/api/*.ts` | Nominatim / Overpass / Open-Meteo / 標高 / 気象庁警報 / KSJ / 接続テスト（NFR-401） |
| 確認優先度サマリー・一覧（SCR-002） | `src/screens/` `src/decorate.ts` | A〜D 件数、カテゴリ別結果 |
| リスク詳細（SCR-003） | `src/components/FindingDrawer.tsx` | 根拠・出典・取得日時・距離・注意事項・コメント |
| AI 調査メモ（SCR-004） | `src/risk/memo.ts` `src/risk/aiMemo.ts` | テンプレート生成 + サーバー側 AI ブローカー経由の生成（任意）、禁止表現チェック・免責必須化 |
| レポート出力（SCR-005） | `src/report/markdown.ts` `csv.ts` | Markdown / CSV（公開区分・UTF-8 BOM） |
| データソース管理（SCR-006） | `src/data/` `src/api/ping.ts` | 台帳表示・接続テスト（実疎通） |
| 取得ログ（SCR-007） | `src/store.tsx` | セッション内の実行履歴（成功/失敗/タイムアウト/スキップ/未実施/視覚確認のみ） |
| システム設定（SCR-008） | `src/settings/appSettings.ts` `src/settings/aiSettings.ts` | AI 設定状態（サーバー側キー管理）・バックエンド接続（既定「このサイト経由（/api プロキシ）」・カスタム URL 保存/解除・接続テスト）・既定値・データ全削除（AI キー以外は localStorage） |
| ダッシュボード（SCR-000） | `src/data/caseStore.ts` | 調査案件一覧・KPI・実データ/ダミー区別・JSON 取込/出力 |

### 5.2 バックエンドモジュール（現行: KSJ 空間検索補助）

| モジュール | 実装 | 内容 |
|---|---|---|
| API 本体 | `backend/app/main.py` | FastAPI。`/livez` `/readyz`（DB 異常時 503）`/api/v1/ping` `/api/v1/nearby`・AI ブローカー（`/api/v1/ai/status` `/api/v1/ai/memo`） |
| 設定 | `backend/app/settings.py` | `OCSRC_` プレフィックス環境変数（DSN・CORS allowlist 等） |
| DB アクセス | `backend/app/db.py` | asyncpg 接続プール、DB 到達性チェック（ドライバ未導入でも起動可能） |
| KSJ 処理 | `backend/app/ksj.py` | GeoJSON パース・検証（WGS84 範囲外は拒否）、スキーマ、`ST_DWithin` 近傍検索 |
| 取込 CLI | `backend/app/ingest.py` | `python -m app.ingest`。同一 `(dataset, source)` は洗い替え（冪等） |

### 5.3 将来構想のバックエンドモジュール（Phase 4+）

> ⚠️ 以下は §3.4 バックエンド中心構成に移行する場合の構想であり、現行実装には存在しない。

| モジュール | 内容 |
|---|---|
| GeocodingService | 住所検索・座標正規化 |
| SiteAnalysisService | 地点リスク分析の統括 |
| AdapterRegistry | データソースアダプタ管理 |
| RiskEngine | 確認優先度計算 |
| DataQualityService | データ品質・取得失敗・鮮度評価 |
| AiMemoService | AI調査メモ生成 |
| ExportService | Markdown / CSV出力 |
| AuditLogService | 操作ログ・取得ログ記録 |
| DataSourceAdminService | データソース台帳・接続テスト |

---

## 6. データフロー

### 6.1 地点リスク確認フロー（現行実装）

すべてブラウザ内（`src/api/runAnalysis.ts` を起点とする TypeScript）で実行される。

```text
1. ユーザー入力（SCR-001）
   - 住所または緯度経度 / 検索半径（100m〜3km） / 確認カテゴリ

2. 入力検証（ブラウザ内）
   - 住所空欄チェック / 緯度経度範囲チェック（WGS84） / 半径・カテゴリ検証

3. ジオコーディング
   - Nominatim へ直接 fetch（住所 → 緯度経度、複数候補は選択）

4. 解析範囲生成
   - 中心点 / 半径 / bbox（src/api/geo.ts、Haversine・WGS84）

5. データ取得（並行実行・部分結果対応）
   - Overpass（道路・水域・施設・駅）      … ブラウザ直 fetch
   - Open-Meteo（7日予報）                 … ブラウザ直 fetch
   - 標高（地理院 → Open-Meteo フォールバック） … ブラウザ直 fetch
   - 気象庁 警報・注意報（都道府県単位）    … ブラウザ直 fetch
   - KSJ 近傍検索（既定: same-origin /api プロキシ経由） … バックエンド /api/v1/nearby
   - ハザードマップ（タイル重ね合わせ・視覚確認） … 地図レイヤ
   - PLATEAU / xROAD                       … 取得失敗・未連携として誠実に表示

6. 正規化・確認項目化（各アダプタ内）
   - 距離計算（最寄り抽出） / 出典・取得日時付与 /
     「該当なし」と「取得失敗」の区別（FR-304 / NFR-504）

7. 確認優先度付与
   - カテゴリ別ルールで A〜D を付与（§11）

8. 画面表示（SCR-002/003）
   - 地図（実ジオメトリ + ハザードタイル） / サマリー / カテゴリ別一覧 / 取得ログ

9. AI 調査メモ生成（SCR-004）
   - テンプレート生成（src/risk/memo.ts）
   - 任意: サーバー側 AI ブローカー（/api/v1/ai/memo）による生成（禁止表現チェック・免責必須化）

10. レポート出力（SCR-005）
   - Markdown / CSV（公開区分つき）

11. 保存（任意）
   - 「ダッシュボードに保存」で localStorage（ocsrc-cases）へ
     確認結果スナップショットごと永続化
```

> **v1.0 構想との差分**: v1.0 では手順 3〜9 をバックエンド（GeocodingService / RiskEngine / `analysis_runs` 保存）で行う構想だったが、現行実装ではサーバ側に分析実行の状態・履歴を持たない。サーバ保存を伴うフローは §3.4 将来構想時に再設計する。

---

## 7. 外部API / データソースアダプタ仕様

### 7.1 共通アダプタインターフェース（現行: TypeScript）

各データソースは `frontend/src/api/` のアダプタとして分離され、共通の `AdapterResult` 契約を返す（NFR-401/402）。将来バックエンドへ移設する場合も、この契約を保ったまま呼び出し先を差し替えられる。

```typescript
// frontend/src/api/types.ts（要旨）
interface AdapterResult {
  findings: Finding[];        // 確認項目（優先度・根拠・出典・取得日時つき）
  log: SourceLog;             // 実行ログ（endpoint / status / 所要ms / エラー）
  stepStatus: 'success' | 'failed' | 'skipped';
}
```

| 契約上のルール | 内容 |
|---|---|
| 失敗の誠実表示 | 取得失敗・タイムアウトは `failed`、未連携・未実装・対象外は `skipped` / `not_attempted`、タイル目視のみは `visual_only` として返し、「該当なし」と混同しない（実通信なしの HTTP コードを記録しない） |
| 出典必須 | `Finding.evidence[]` に出典（attribution）・取得日時・整備年度を必ず付与する |
| 部分結果 | アダプタ単位で独立して失敗でき、他カテゴリの表示を妨げない（NFR-101） |

### 7.2 取得結果の状態区分

| 状態 | 意味 |
|---|---|
| success | 取得成功（0 件の「該当なし」を含む） |
| failed | API 失敗・タイムアウト・DB 未整備（503） |
| skipped | 対象カテゴリ未選択・実装前ソース（PLATEAU / xROAD 等）によるスキップ |
| not_attempted | 実リクエストなし（未実装・規約未同意） |
| visual_only | タイル重ね合わせ等の目視確認のみ（実取得の成否を検証していない） |

---

## 8. データソース別仕様

### 8.1 OpenStreetMap / Nominatim Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 住所・地名検索、緯度経度取得 |
| 方式 | HTTP GET |
| 主なパラメータ | `q`, `format=json`, `limit`, `countrycodes` |
| 出力 | 候補地名、緯度、経度、表示名、OSM種別 |
| 制約 | 公開Nominatim利用時は大量利用禁止。最大1 req/sec、User-Agent、出典表示が必要 |
| キャッシュ | 必須。住所検索結果を一定期間保存 |
| 本番方針 | 高頻度利用時は商用サービスまたは自前Nominatimを検討 |

#### サンプルレスポンス正規化

```json
{
  "place_id": "string",
  "display_name": "string",
  "lat": 35.0,
  "lon": 139.0,
  "source": "nominatim",
  "confidence_note": "住所候補のため、地図上で位置確認してください"
}
```

### 8.2 OpenStreetMap / Overpass Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 周辺道路、河川、水路、鉄道、施設、土地利用取得 |
| 方式 | Overpass QL |
| 取得範囲 | bboxまたは半径検索 |
| 主なタグ | `highway`, `waterway`, `railway`, `landuse`, `amenity`, `building`, `bridge`, `tunnel` |
| 注意 | OSMデータは網羅性・属性精度に地域差がある |
| 本番方針 | キャッシュまたは地域抽出データのローカルDB化を検討 |

#### Overpass QL例

```text
[out:json][timeout:25];
(
  way["highway"](around:500,35.0000,139.0000);
  way["waterway"](around:500,35.0000,139.0000);
  node["amenity"](around:500,35.0000,139.0000);
  way["railway"](around:500,35.0000,139.0000);
);
out body;
>;
out skel qt;
```

### 8.3 Open-Meteo Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 気象予報、降水、風速、気温、降雪等 |
| 方式 | HTTP GET |
| エンドポイント | `/v1/forecast` |
| 必須パラメータ | `latitude`, `longitude` |
| 推奨変数 | `precipitation`, `rain`, `snowfall`, `wind_speed_10m`, `wind_gusts_10m`, `temperature_2m` |
| 出力 | 時間別予報、日別予報 |
| 注意 | 予報は時刻により変化するため取得日時を必ず表示 |

#### 取得例

```text
https://api.open-meteo.com/v1/forecast?latitude=35.0&longitude=139.0&hourly=precipitation,rain,wind_speed_10m,wind_gusts_10m,temperature_2m&forecast_days=7&timezone=Asia%2FTokyo
```

### 8.4 国土数値情報 Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 河川、公共施設等（現行取込対象）。行政区域・土地利用・災害関連は拡張候補 |
| 方式 | 事前ダウンロード + ローカルDB検索（バックエンド `/api/v1/nearby` 経由） |
| 形式 | GeoJSON FeatureCollection（Shapefile 等は GeoJSON へ変換して取込） |
| DB | PostgreSQL + PostGIS（`ksj_features` テーブル、§9.2） |
| 更新 | 管理者が `python -m app.ingest` で取込。出典・整備年度（source_updated_at）を保持 |
| 注意 | データ種別により整備年度・属性・精度が異なる |

#### 取込処理（現行実装）

```text
1. 国土数値情報ダウンロードサイト等から GeoJSON を入手
   （NII Geoshape 経由の実データ取込が検証済みルート。backend/data/README.md 参照）
2. python -m app.ingest <file> --dataset river|facility --source <出典> --source-updated <整備年度>
3. パース・検証（WGS84 範囲外は拒否・NFR-505）
4. PostGIS 取込（同一 dataset+source は洗い替え・冪等）
5. 空間インデックス作成（スキーマ初期化時）
```

### 8.5 ハザードマップポータル Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 洪水、土砂災害等の重ね合わせ表示 |
| 方式 | タイル表示（地図レイヤ重ね合わせ・視覚確認） |
| 表示 | 地図レイヤ重ね合わせ |
| 注意 | タイル表示は視覚確認向け。重なりの自動判定は行わない。厳密な判定には元データ・自治体資料確認が必要 |
| 出典 | ハザードマップポータルサイトとして表示 |

### 8.6 国土地理院 地理院タイル Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 背景地図（淡色/標準/写真）、標高、陰影起伏 |
| 方式 | タイル取得・標高 API |
| 表示 | 地図のベースマップ / レイヤ |
| 注意 | タイル種別ごとに利用条件・出典表記を確認 |
| 出典 | 国土地理院または地理院タイル |

### 8.7 PLATEAU Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 3D都市モデル、建物・都市構造確認 |
| 現行 | 未連携（試験運用・SLA 無しのため見送り）。取得失敗の扱いを画面上で実証 |
| 将来実装 | 建物高さ、周辺建物密度、3D表示 |
| 注意 | 地域により整備状況が異なる |

### 8.8 xROAD Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 道路データ、交通量、道路関係データ確認 |
| 現行 | 未連携（利用規約同意が必要・匿名アクセス 403 のため見送り）。「未連携」として誠実に表示 |
| 将来実装 | API連携、道路交通量、旅行速度、道路施設情報の統合表示 |
| 注意 | API利用規約への同意が必要な場合がある。対象道路範囲に注意 |

---

## 9. データベース設計

### 9.1 現行実装のデータ保持

| 保存先 | 内容 |
|---|---|
| ブラウザ `localStorage` | 調査案件（`ocsrc-cases`、確認結果スナップショット含む）、システム設定（AI キー・バックエンド URL・既定値）、テーマ |
| PostGIS `ksj_features`（本番: Neon マネージド PostgreSQL / ローカル開発: docker compose） | KSJ 取込データ（河川・公共施設）のみ。**利用者の検索履歴・分析結果はサーバ側に保存しない** |

### 9.2 ksj_features テーブル（現行・`backend/app/ksj.py`）

| カラム | 型 | 内容 |
|---|---|---|
| id | BIGSERIAL | 主キー |
| dataset | TEXT | `river` / `facility` |
| name | TEXT | 地物名（W05_004 / P02_003 等から解決） |
| attrs | JSONB | 元データ属性 |
| source | TEXT | 出典（attribution、NFR-301） |
| source_updated_at | TEXT | データ整備年度 |
| retrieved_at | TIMESTAMPTZ | 取込日時 |
| geom | GEOMETRY(GEOMETRY, 4326) | WGS84 ジオメトリ（GiST インデックス） |

### 9.3 将来構想の ER / テーブル設計（Phase 4+）

> ⚠️ 以下は §3.4 バックエンド中心構成（サーバ側での案件管理・監査）に移行する場合の構想であり、現行実装には存在しない。

```text
users
  └── analysis_runs
        ├── input_locations
        ├── findings
        │     └── evidence_items
        ├── ai_memos
        └── exports

data_sources
  ├── api_health_logs
  └── source_layers

risk_rules
api_request_logs
```

| テーブル | 用途 |
|---|---|
| users | ユーザー情報 |
| analysis_runs | 地点分析実行単位 |
| input_locations | 入力地点・ジオコーディング結果 |
| data_sources | データソース台帳 |
| source_layers | データソース内レイヤ |
| api_request_logs | API実行ログ |
| findings | 確認結果 |
| evidence_items | 確認結果の根拠 |
| ai_memos | AI調査メモ |
| exports | 出力履歴 |
| risk_rules | 確認優先度ルール |
| api_health_logs | API接続状態ログ |

（各テーブルのカラム定義は v1.0 を参照。移行時に現行の `Finding` / `Evidence` 型（`frontend/src/types.ts`）から逆算して再設計する）

---

## 10. API設計

### 10.1 現行実装 API（バックエンド FastAPI）

バックエンドは KSJ 空間検索補助と AI ブローカーを提供する。既存の検索系は**読み取り専用（GET のみ）・無認証**、AI ブローカーは `POST /api/v1/ai/memo` のみボディ付きリクエストを許容する（無認証の設計判断は §15.2 参照）。

| Method | Path | 概要 |
|---|---|---|
| GET | `/livez` | liveness（プロセス生存のみ・DB 非依存） |
| GET | `/readyz` | readiness（DB 到達性。異常時は 503） |
| GET | `/healthz` | `/readyz` の後方互換エイリアス（異常時は 503） |
| GET | `/api/v1/ping` | API 疎通確認 |
| GET | `/api/v1/nearby?lat=&lon=&radius_m=` | 取込済み KSJ（河川・施設）の近傍検索。距離昇順・出典・整備年度つき |
| GET | `/api/v1/ai/status` | AI 設定状態（configured / model。キーは返さない） |
| POST | `/api/v1/ai/memo` | AI メモ生成ブローカー（キーはサーバー側のみ） |

#### GET `/api/v1/nearby`

| パラメータ | 制約 | 内容 |
|---|---|---|
| lat | -90〜90（必須） | 緯度（WGS84） |
| lon | -180〜180（必須） | 経度（WGS84） |
| radius_m | 1〜10000（既定 1000） | 検索半径 [m] |

```json
{
  "status": "ok",
  "count": 2,
  "items": [
    {
      "dataset": "river",
      "name": "日本橋川",
      "distance_m": 120.5,
      "attrs": {},
      "source": "国土数値情報 河川データ（W05）",
      "source_updated_at": "2021年度",
      "retrieved_at": "2026-07-01T10:00:00+09:00"
    }
  ],
  "meta": { "lat": 35.6845, "lon": 139.773, "radius_m": 1000 }
}
```

- DB 未設定・未到達時は **503** を返す（空配列を返さない）。フロントは「該当なし」と「取得失敗」を区別表示できる（FR-304 / NFR-504）
- SPA からの呼び出しは**既定で相対パス（same-origin）**であり、SPA 配信オリジン（`ocsrc-web`）の `/api/*` プロキシを経由して 127.0.0.1 バインドの API へ到達する（Issue #57）。SCR-008 のカスタム URL またはビルド時 `VITE_OCSRC_BACKEND_URL` を設定した場合のみ、その URL へ直結する
- SCR-008 の接続テストは、既定（same-origin）ではプロキシ特例の `/api/readyz`、カスタム URL 設定時は `{URL}/readyz` を呼び、DB 到達性（`db: ok`）まで確認する

#### CORS（`OCSRC_CORS_ORIGINS`）

| 設定 | 挙動 |
|---|---|
| 未設定（既定） | CORS 無効（本番は same-origin プロキシ経由のため cross-origin 許可は不要） |
| 明示 allowlist（例 `http://localhost:5173`） | 開発時のみのオプトイン。GET のみ・credentials なし |
| ワイルドカード `*` | 起動時にエラーとして拒否 |

### 10.2 将来構想 API（Phase 4+）

> ⚠️ 以下は §3.4 バックエンド中心構成の構想 API であり、現行実装には存在しない。現行では同等機能（ジオコーディング・分析・AI メモ・出力）をブラウザ内で実行する。

| Method | Path | 概要 |
|---|---|---|
| GET | `/api/health` | ヘルスチェック |
| POST | `/api/geocode` | 住所検索 |
| POST | `/api/site-analyses` | 地点分析開始 |
| GET | `/api/site-analyses/{id}` | 分析結果取得 |
| GET | `/api/site-analyses/{id}/findings` | 確認結果一覧取得 |
| POST | `/api/site-analyses/{id}/ai-memo` | AIメモ生成 |
| GET | `/api/site-analyses/{id}/export.md` | Markdown出力 |
| GET | `/api/site-analyses/{id}/export.csv` | CSV出力 |
| GET | `/api/data-sources` | データソース一覧 |
| POST | `/api/data-sources/{key}/health-check` | 接続テスト |
| GET | `/api/api-logs` | APIログ一覧 |

（リクエスト/レスポンス例は v1.0 を参照）

### 10.3 Findingオブジェクト（現行・フロントエンド型）

現行実装では `frontend/src/types.ts` の `Finding` / `Evidence` 型が同等の役割を担う。

```json
{
  "id": "ksj-river-1",
  "category": "rivers",
  "priority": "B",
  "title": "国土数値情報の河川・水路が検索半径内に存在",
  "summary": "…河川管理者資料・河川区域・占用条件の確認を推奨します。",
  "status": "found",
  "distance_m": 120.5,
  "caution": "KSJ の整備年度時点のデータです。改修・付け替え等で現況と異なる場合があります。",
  "evidence": [
    {
      "source_key": "ksj",
      "layer_name": "河川・水路（KSJ）",
      "fetched_at": "2026-07-01 10:00",
      "source_updated_at": "2021年度",
      "attribution": "国土数値情報 河川データ（W05）"
    }
  ]
}
```

---

## 11. 確認優先度ロジック

> 現行実装はフロントエンド（`frontend/src/api/` 各アダプタおよび `src/decorate.ts`）の TypeScript にある。以下のルール定義・擬似コードは実装の設計根拠として維持する。

### 11.1 基本思想

確認優先度は、施工可否や危険度ではなく、次に人間が確認すべき優先順位を示す。

### 11.2 優先度定義

| 優先度 | 条件概要 |
|---|---|
| A：専門確認優先 | 災害関連レイヤと重なる、河川・海岸・急傾斜等が近接、または複数の懸念が重なる |
| B：追加確認推奨 | 道路、施設、地形、気象等に留意情報がある |
| C：参考情報あり | 周辺情報として把握すべきデータがある |
| D：データ不足 | 対象データ未取得、対象範囲外、API失敗、該当確認不可 |

### 11.3 ルール例

| ルールID | カテゴリ | 条件 | 優先度 |
|---|---|---|---|
| RR-001 | hazard | 地点が洪水・土砂・津波等のレイヤと重なる | A |
| RR-002 | rivers | 河川・水路が100m以内に存在 | A |
| RR-003 | rivers | 河川・水路が500m以内に存在 | B |
| RR-004 | roads | 主要道路までの距離が遠い、または道路情報が少ない | B |
| RR-005 | facilities | 学校・病院等が近接 | B |
| RR-006 | weather | 直近予報で強雨・強風・降雪が見込まれる | B |
| RR-007 | terrain | 標高・傾斜・低地等の地形確認が必要 | B |
| RR-008 | data_quality | API取得失敗、データ更新日不明 | D |

> RR-001（ハザードレイヤとの重なり自動判定）は現行実装では行わず、タイル重ね合わせによる**視覚確認**として提供する（出典明示・断定回避）。

### 11.4 擬似コード

```python
def classify_priority(findings: list[Finding], data_quality: DataQuality) -> str:
    if data_quality.all_failed:
        return "D"

    if any(f.category == "hazard" and f.status == "found" and f.intersects_site for f in findings):
        return "A"

    if any(f.category == "rivers" and f.distance_m is not None and f.distance_m <= 100 for f in findings):
        return "A"

    caution_count = sum(1 for f in findings if f.priority in ["A", "B"])
    if caution_count >= 3:
        return "A"

    if caution_count >= 1:
        return "B"

    if any(f.status == "found" for f in findings):
        return "C"

    return "D"
```

### 11.5 データ品質補正

| 条件 | 補正 |
|---|---|
| データ取得失敗 | 優先度Dを追加し、判断材料不足として表示 |
| データ更新日が古い | 注意文を付与 |
| 出典不明 | 判定材料から除外 |
| 座標精度が低い | AIメモに位置確認を追加 |
| 複数候補住所から未確定 | 分析を実行せず候補選択を要求 |

---

## 12. AI調査メモ仕様

> 現行実装はフロントエンド（`frontend/src/risk/memo.ts`・`aiMemo.ts`）にあり、テンプレート生成を基本とする。AI 生成はサーバー側ブローカー（`backend/app/ai.py`・`POST /api/v1/ai/memo`）を経由し、Anthropic API キーはサーバー環境変数（`OCSRC_ANTHROPIC_API_KEY`）のみで管理する（外部評価 Phase 0）。ブラウザから Anthropic API への直接送信・キー保存は行わない。

**利用量制御（CodeRabbit #241 指摘対応・§15.2.1 の設計判断）**: AI ブローカーは
コストを伴う外部 API 呼び出しのため、web 層（IP 別・60 秒・20 回の POST レート制限）と
API 層（プロセス内・60 秒・10 回の固定窓 + 同時実行上限 2、超過は 429 で即拒否）で
利用量を制限する。AI 経路の上流アイドルタイムアウトは 95 秒（`OCSRC_AI_PROXY_TIMEOUT_MS`）、
POST ボディ受信は 64KB 上限 + `OCSRC_PROXY_TIMEOUT_MS` の受信タイムアウトを適用する。

### 12.1 AIメモ生成入力

```json
{
  "location": {
    "address": "string",
    "latitude": 35.0,
    "longitude": 139.0,
    "search_radius_m": 500
  },
  "findings": [],
  "data_sources": [],
  "failed_sources": [],
  "output_policy": {
    "no_definitive_judgement": true,
    "include_disclaimer": true,
    "use_priority_terms": true
  }
}
```

### 12.2 AIメモ構成

```markdown
# AI調査メモ

## 1. 調査地点
- 住所：...
- 緯度経度：...
- 検索半径：...

## 2. 確認優先度サマリー
- 専門確認優先：...
- 追加確認推奨：...
- 参考情報：...
- データ不足：...

## 3. 要確認事項
...

## 4. 追加調査候補
...

## 5. 現地確認候補
...

## 6. 取得できなかった情報
...

## 7. 参照データ
...

## 8. 注意事項
本メモは公開データに基づく初期調査支援であり、施工可否、法的適合性、安全性を断定するものではありません。
```

### 12.3 AI出力禁止ルール

AIメモ生成後に、以下の表現が含まれる場合は再生成または置換する（回帰テストで保証・`src/risk/memo.ts`）。

| 禁止語 | 置換候補 |
|---|---|
| 安全です | 追加確認事項は限定的です |
| 危険です | 専門確認を優先してください |
| 問題ありません | 公開データ上、明確な該当情報は確認されませんでした |
| 施工できます | 施工条件の詳細確認が必要です |
| リスクはありません | 該当データは確認されませんでした |

---

## 13. 画面仕様

> SCR-001〜007 に加え、実装では SCR-000（ダッシュボード）・SCR-008（システム設定）を追加した。全画面の実装状況は README「実装済み機能」を参照。

### 13.1 SCR-001 地点入力画面

#### 表示項目

1. システム名
2. 注意文
3. 住所入力欄
4. 緯度入力欄
5. 経度入力欄
6. 検索半径選択
7. 確認カテゴリチェックボックス
8. 「地点確認を開始」ボタン
9. 「サンプル地点で試す」ボタン

#### 入力チェック

| 項目 | 条件 |
|---|---|
| 住所 | 住所または緯度経度のどちらか必須 |
| 緯度 | -90〜90 |
| 経度 | -180〜180 |
| 検索半径 | 100m〜3000m |
| カテゴリ | 1つ以上選択 |

### 13.2 SCR-002 地点リスク判定画面

#### レイアウト

```text
+--------------------------------------------------+
| ヘッダー：地点名 / 取得日時 / 出力ボタン           |
+-----------+----------------------+---------------+
| 条件      | 地図                 | サマリー       |
| パネル    | - 地点ピン            | A/B/C/D件数    |
|           | - 検索半径            | データ品質     |
|           | - レイヤ              | 免責           |
+-----------+----------------------+---------------+
| カテゴリ別リスク一覧                              |
+--------------------------------------------------+
| AI調査メモ                                        |
+--------------------------------------------------+
```

#### 地図レイヤ

| レイヤ | 内容 |
|---|---|
| base_gsi | 地理院標準地図 |
| osm_roads | OSM道路 |
| osm_water | OSM水路・河川 |
| ksj_layers | 国土数値情報 |
| hazard_layers | ハザードマップ系 |
| plateau_area | PLATEAU対象区域 |
| xroad | xROAD関連 |

### 13.3 SCR-003 リスク詳細画面

#### 表示項目

1. 確認項目名
2. 確認優先度
3. 概要
4. 地点からの距離
5. 地図上の位置
6. 根拠データ一覧
7. データ取得日時
8. データ更新日
9. 出典
10. 注意事項
11. ユーザーコメント欄

---

## 14. Markdown出力仕様

### 14.1 ファイル名

```text
site-risk-check_{YYYYMMDD_HHMM}_{location_slug}.md
```

### 14.2 出力テンプレート

```markdown
# 工事候補地リスク確認メモ

## 1. 調査条件

| 項目 | 内容 |
|---|---|
| 入力地点 | ... |
| 緯度経度 | ... |
| 検索半径 | ... |
| 実行日時 | ... |

## 2. 確認優先度サマリー

| 優先度 | 件数 |
|---|---:|
| A：専門確認優先 | ... |
| B：追加確認推奨 | ... |
| C：参考情報あり | ... |
| D：データ不足 | ... |

## 3. カテゴリ別確認結果

...

## 4. AI調査メモ

...

## 5. 取得できなかった情報

...

## 6. 参照データ・出典

...

## 7. 注意事項

本資料は公開データに基づく初期調査支援資料であり、施工可否、設計判断、法令適合性、安全性を断定するものではありません。
```

---

## 15. セキュリティ設計

### 15.1 現行実装のセキュリティ対策

| 対策 | 実装箇所 | 内容 |
|---|---|---|
| セキュリティヘッダ | `frontend/server.mjs` | 全レスポンスに CSP（外部オリジン許可リスト方式）/ `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` / `Referrer-Policy` を付与 |
| same-origin プロキシ | `frontend/server.mjs` | `/api/*` を `OCSRC_BACKEND_ORIGIN`（環境変数固定・SSRF 防止）へ中継。GET/HEAD を基本とし、AI ブローカー（`/api/v1/ai/*`）のみ POST を許可（64KB 上限）。パス正規化後も `/api` 配下に留まることを再検証 |
| API の非公開バインド | `scripts/install-systemd-api.sh` | FastAPI は 127.0.0.1 バインドで LAN へ直接露出しない（多層防御）。SPA からは same-origin プロキシ経由 |
| CORS 既定無効 | `backend/app/main.py` | `OCSRC_CORS_ORIGINS` 明示 allowlist のみ（開発用オプトイン）。ワイルドカードは起動時拒否、GET のみ・credentials なし |
| 入力検証 | `backend/app/main.py` / フロント各画面 | lat/lon/radius_m の範囲検証（FastAPI Query 制約）、WGS84 範囲外の取込拒否 |
| パストラバーサル対策 | `frontend/server.mjs` | 配信パスの正規化・realpath 検証（シンボリックリンク経由の脱出も遮断） |
| DB 資格情報の分離 | `/etc/ocsrc/api.env`（root:root, 600） | リポジトリ外で管理。`infra/.env` はコミット対象外 |
| 依存関係スキャン | `.github/workflows/ci.yml` / `.github/dependabot.yml` | CI security ジョブ（`npm audit --audit-level=high` / `pip-audit`）+ Dependabot 週次（npm / pip / github-actions） |
| CI サプライチェーン対策 | `.github/workflows/ci.yml` | Actions の SHA ピン留め、`persist-credentials: false`、`permissions: contents: read` |
| AI API キーの扱い | サーバー側（`/etc/ocsrc/api.env` の `OCSRC_ANTHROPIC_API_KEY`） | ブラウザ・localStorage・リポジトリには置かない。ブラウザは自社ブローカー経由のみ（外部評価 Phase 0） |

### 15.2 運用境界（設計判断の明文化・v1.1）

本節は「どの範囲での運用を前提に現行のセキュリティ水準を設計したか」を定義する。**この境界を超えて運用する場合は追加対策が必須**である。

#### 15.2.1 無認証 API は設計判断である

バックエンド API（`/api/v1/*`）は認証を持たない。これは以下を根拠とする**意図的な設計判断**であり、実装漏れではない。

1. 提供するデータは**国土交通省の公共オープンデータ（国土数値情報）のみ**であり、個人情報・業務機密を含まない。
2. API は**読み取り専用（GET のみ。AI ブローカー `POST /api/v1/ai/memo` を除く）**で、データを変更・削除する手段を持たない。
3. 利用者の入力（候補地住所等）はサーバ側に保存されず、認証で保護すべきサーバ側リソースが存在しない。
4. API は 127.0.0.1 バインドで、到達経路は same-origin プロキシに限定される。
5. **外部評価 #240 対応**: 本番（`OCSRC_ACCESS_TEAM_DOMAIN` / `OCSRC_ACCESS_AUD` 設定時）は
   LAN 直アクセスにも Access JWT を必須化した。LAN 利用者は公開 URL 経由で Access セッションを
   取得し、個人 ID（Access の IdP が発行する JWT の email 等）で識別される。開発モード
   （Access 未設定）のみ LAN 直アクセスを許可する。

#### 15.2.2 HTTP 平文は信頼 LAN 内前提である

フロント配信（`:8700`）は HTTP 平文である。これは**信頼できる LAN 内（家庭内・社内閉域）での利用を前提**とした構成である。

| 前提 | 内容 |
|---|---|
| 通信内容 | 公開データの取得結果・画面資材のみ（認証情報・個人情報の送信なし） |
| ネットワーク | 信頼 LAN 内。インターネットへのポート公開は行わない（公開は §15.2.3 の Cloudflare Tunnel 経由のみ） |
| ブラウザ→外部 API | HTTPS（CSP の許可リストで送信先を制限） |

#### 15.2.3 LAN 外へ公開する場合の必須要件

信頼 LAN の外（インターネット・不特定多数の社内ネットワーク等）へ公開する場合は、**公開前に**以下をすべて満たすこと。

| # | 必須要件 | 実現手段の例 |
|---|---|---|
| 1 | TLS 終端（HTTPS 化） | reverse proxy（nginx / Caddy / Cloudflare Tunnel 等）で `:8700` の前段に配置 |
| 2 | 認証 | reverse proxy での Basic 認証 / OIDC（Entra ID 等）連携 |
| 3 | レート制限 | reverse proxy のレート制限（外部公開 API の利用ポリシー保護のためにも必須） |
| 4 | 秘密情報の再点検 | `OCSRC_DB_PASSWORD` の強パスワード化（§15.2.4）、`/etc/ocsrc/api.env` の権限確認 |

**公開実態（2026-07-31 現在）**: 上表の要件 1・2 は **Cloudflare Tunnel（`ocsrc-tunnel`）+ Cloudflare Access** で充足して公開中である。エッジで TLS 終端と認証を行い、`frontend/server.mjs` が Access JWT（`Cf-Access-Jwt-Assertion`）を JWKS で検証する。未認証アクセスは Access ログインへ 302 誘導される。要件 3（明示的なレート制限ルール）は未設定の残課題。要件 4 は本番 DB の Neon 移行に伴い、接続文字列を `/etc/ocsrc/api.env`（root:root, 600）で管理する。ポート 8700 の WAN 直接到達不可は維持している（Tunnel は outbound 接続のため受信ポート開放なし）。

> **更新（2026-08-05・外部評価 #240）**: JWT 検証は Tunnel 経由に加えて **LAN 直アクセスにも適用**。
> Access 未設定の開発モード以外で、`/healthz` を除く全経路が認証必須となった。要件 3
> （レート制限）は web 層（認証失敗 10 回/60s）+ AI POST（20 回/60s）+ API 層（AI 10 回/60s・同時実行 2）を導入済み。

> 補足: 外部評価 Phase 0 以降、AI API キーはブラウザ・localStorage に保存しない。サーバー側の `OCSRC_ANTHROPIC_API_KEY` のみで管理するため、共有端末でのキー漏えいリスクは解消される。

#### 15.2.4 本番 DB パスワードの強制 override（必須）

`infra/.env.example` の `OCSRC_DB_PASSWORD=dev_only_password` は**ローカル開発専用**である。本番・共有環境では、初回起動前に必ず強パスワード（例: `openssl rand -hex 24`）へ変更し、`/etc/ocsrc/api.env` の DSN と一致させること。手順の正本は [`docs/deploy-backend.md`](deploy-backend.md)「🔐 パスワード運用」を参照。

### 15.3 機微情報対策（現行）

1. 利用者の入力住所・検索履歴・分析結果は**サーバ側に保存しない**（ブラウザ `localStorage` のみ）。
2. 民間案件の候補地は社外秘として扱う（レポートの公開区分選択で明示）。
3. エクスポート時に公開区分を選択できる（実装済み・SCR-005）。
4. API キーやトークンはリポジトリに保存しない。`infra/.env.example` にはダミー値のみ記載する。
5. DB 資格情報はリポジトリ外（`/etc/ocsrc/api.env`）で管理する。

### 15.4 認証・認可（将来構想・MVP スコープ外）

> ⚠️ 以下は §3.4 バックエンド中心構成へ移行する場合の構想であり、**MVP スコープ外（クライアント完結設計の意図的判断・§2.3）**である。現行の運用境界は §15.2 に従う。サーバ側に案件データ・ユーザー管理を持つ段階（Phase 4+）で必須となる。
>
> 📝 **追記（2026-08-14）**: 案件台帳 API（Issue #111）で **RBAC（viewer/editor/approver/admin/auditor）と監査ログの垂直スライスを実装**（`backend/app/cases.py`・`backend/app/main.py`・`backend/tests/test_cases_*`）。ただし **feature flag `OCSRC_CASE_STORE_ENABLED`（既定 false）で無効**のまま本番には未適用。有効化時は本節のロール設計（reviewer は approver 相当）と監査ログ保全方針を確定してから行う。

#### 認証（構想）

| 環境 | 認証方式 |
|---|---|
| ローカル開発 | 認証なし、または開発用簡易認証 |
| モック公開 | Basic認証または限定URL |
| 社内検証 | Entra ID / OIDC |
| 本番 | Entra ID / OIDC + ロール制御 |

#### 認可（構想・要件 §15 権限ロール対応）

| ロール | 権限 |
|---|---|
| viewer | 検索・閲覧 |
| editor | メモ編集・出力 |
| reviewer | コメント・確認済み登録 |
| admin | データソース管理、ログ閲覧 |

#### MVP スコープ外の要件一覧

| 要件 ID | 内容 | スコープ外の理由 |
|---|---|---|
| FR-605 | リスク確認ルールの管理者編集 + 承認フロー | ルールはコード（テスト付き）で管理。サーバ側ルール DB・承認フローは Phase 4+ |
| NFR-201 | Entra ID 認証 | 認証で保護すべきサーバ側リソースがない（§15.2.1） |
| NFR-203 | 住所・地点・レポートへのアクセス権限 | データはサーバに保存されず、利用者自身のブラウザ内で完結する |
| NFR-204 | 機微情報の取り扱い制御（サーバ側） | サーバ側で預からないことを対策とした（§15.3） |
| NFR-205 | 操作ログ・検索ログ・エクスポートログの記録 | サーバ側にユーザー概念がない。取得ログは SCR-007 でセッション内表示のみ |
| 要件 §15 | 権限ロール（一般/レビュー/管理者/監査） | 同上。Phase 4+ の案件管理機能とセットで導入 |

---

## 16. ログ設計

### 16.1 現行実装のログ

| ログ | 実装 | 内容 |
|---|---|---|
| 取得ログ（SCR-007） | フロントエンド（セッション内） | データソース別の実行履歴（endpoint / ステータス / 所要 ms / エラー）。成功・失敗・タイムアウト・スキップを区別。**永続化しない** |
| 配信・プロキシログ | `ocsrc-web`（journald） | `journalctl -u ocsrc-web` で参照（プロキシエラー等） |
| API ログ | `ocsrc-api`（journald） | `journalctl -u ocsrc-api` で参照（uvicorn アクセスログ・例外） |

> サーバ側での操作ログ・検索ログの永続記録（NFR-205）は MVP スコープ外（§15.4）。

### 16.2 将来構想の API 実行ログ（Phase 4+）

> ⚠️ 以下はバックエンド中心構成の構想であり、現行実装には存在しない。

| 項目 | 内容 |
|---|---|
| request_id | リクエストID |
| analysis_run_id | 分析ID |
| source_key | データソース |
| endpoint | APIエンドポイント |
| status_code | HTTPステータス |
| status | success / failed / timeout |
| duration_ms | 処理時間 |
| error_message | エラー内容 |
| fetched_at | 取得日時 |

### 16.3 将来構想の操作ログ（Phase 4+）

| 操作 | 記録内容 |
|---|---|
| 地点検索 | ユーザー、時刻、検索条件 |
| レポート出力 | ユーザー、時刻、形式 |
| AIメモ生成 | ユーザー、時刻、対象分析ID |
| データソース変更 | 管理者、変更前後、時刻 |

---

## 17. エラーハンドリング

| エラー | 表示メッセージ | 処理 |
|---|---|---|
| 住所候補なし | 住所候補が見つかりません。緯度経度入力もお試しください。 | 分析停止 |
| 外部APIタイムアウト | 一部データを取得できませんでした。結果は部分表示です。 | 部分結果表示 |
| レート制限 | データソースの利用制限に達しました。時間をおいて再実行してください。 | 再実行案内 |
| KSJ バックエンド未到達（503 / ネットワーク断） | 取得失敗として表示（「該当なし」と区別） | 部分結果表示 |
| AI生成失敗 | AI調査メモを生成できませんでした。確認結果一覧は利用できます。 | AIメモのみ失敗（テンプレート生成は継続） |
| データ未整備 | この地点では対象データが未整備の可能性があります。 | D表示 |

---

## 18. テスト設計

### 18.1 単体テスト（現行）

| 対象 | 実装 | テスト内容 |
|---|---|---|
| AI調査メモ | `frontend/src/risk/memo.ts` | 免責文必須化・断定表現禁止・8 セクション構成・根拠紐付け |
| Markdown レポート | `frontend/src/report/markdown.ts` | 免責文・公開区分・優先度集計 |
| CSV レポート | `frontend/src/report/csv.ts` | RFC 4180 エスケープ・距離丸め・出典連結 |
| 距離・bbox | `frontend/src/api/geo.ts` | Haversine・WGS84 |
| 気象庁警報 | `frontend/src/api/jmaWarning.ts` | 都道府県コード変換・警報抽出・確認項目化 |
| KSJ アダプタ | `frontend/src/api/ksj.ts` | 応答→確認項目変換・「該当なし」と「取得失敗」の区別 |
| ラベル辞書 | `frontend/src/data/constants.ts` | 網羅性・「該当なし／データ未取得」の区別 |
| KSJ パース | `backend/tests/test_ksj_parse.py` | GeoJSON 検証・WGS84 範囲外拒否・名称解決 |
| API | `backend/tests/test_api.py` ほか | healthz / ping / nearby（バリデーション・503 区別） |
| 取込 CLI | `backend/tests/test_ingest_cli.py` | エラー経路（DSN なし・有効地物ゼロ） |

### 18.2 統合テスト（現行）

| ケース | 内容 |
|---|---|
| PostGIS 統合 | `backend/tests/test_ksj_db_integration.py`。CI の PostGIS サービスコンテナ上で取込→近傍検索を検証 |
| スモークテスト | `frontend/scripts/smoke-test.mjs`。vitest と同一テスト資産を esbuild ランナーで二重検証（環境非依存） |

### 18.3 UAT観点

| 観点 | 確認内容 |
|---|---|
| 非IT利用者理解 | 画面の意味が直感的に分かるか |
| 土木技術者確認 | 出力された確認事項が実務上使えるか |
| 断定回避 | 安全・危険などの断定表現がないか |
| 根拠確認 | 出典・取得日時・根拠が見えるか |
| 説明資料化 | レポートを社内説明に使えるか |

---

## 19. CI/CD設計

### 19.1 GitHub Actions（現行・`.github/workflows/ci.yml`）

`main` への push / PR で以下の 3 ジョブを実行する。

| ジョブ | 内容 |
|---|---|
| frontend | Node 22。`npm ci` → lint（ESLint）→ typecheck（tsc）→ unit test（vitest）→ smoke test（esbuild）→ build |
| backend | Python 3.12 + **PostGIS サービスコンテナ**。ruff → pytest（KSJ 空間検索の統合テスト含む） |
| security | `npm audit --audit-level=high`（frontend）+ `pip-audit`（backend requirements）。既知脆弱性検出で fail |

補助的な対策:

- Actions は**コミット SHA でピン留め**（サプライチェーン対策）
- `permissions: contents: read` / `persist-credentials: false`
- `concurrency` で同一ブランチの旧実行を自動打ち切り
- `.github/dependabot.yml`: npm / pip / github-actions を**週次**で更新チェックし PR を自動作成

### 19.2 デプロイ（現行）

| 対象 | 手段 | 正本手順 |
|---|---|---|
| フロント（ocsrc-web） | `scripts/install-systemd.sh`（ビルド→ユニット生成→enable --now） | README「常駐サービス」 |
| API（ocsrc-api） | `scripts/install-systemd-api.sh`（venv 構築→127.0.0.1 バインド→web へプロキシ先注入） | [`docs/deploy-backend.md`](deploy-backend.md) |
| DB（ocsrc-db） | `docker compose --profile phase2 up -d db` | 同上 |

デプロイは人間が手動で実行する（CI からの自動デプロイは行わない）。

---

## 20. Docker Compose 構成（現行・`infra/docker-compose.yml`）

profile によりフロント配信と Phase 2 系を分離している。

| サービス | 起動条件 | 内容 |
|---|---|---|
| ocsrc-web | 既定（`docker compose up -d`） | フロント静的配信（server.mjs）。systemd 経路の代替 |
| db（ocsrc-db） | `--profile phase2` | PostGIS。127.0.0.1:5432 バインド |
| backend（ocsrc-backend） | `--profile phase2` | FastAPI コンテナ。**systemd 経路（ocsrc-api）と併用しない**（ポート二重化防止・docs/deploy-backend.md 参照） |

```bash
cd infra
cp .env.example .env                          # DB パスワード等（コミット禁止・要強パスワード化）
docker compose up -d                          # フロント配信のみ
docker compose --profile phase2 up -d db      # DB のみ（systemd API と組み合わせる本番構成）
docker compose --profile phase2 up -d --build # DB + backend コンテナ（開発向け）
```

---

## 21. 環境変数（現行）

### 21.1 バックエンド（prefix `OCSRC_`・`backend/app/settings.py`）

```env
OCSRC_APP_ENV=production
OCSRC_DATABASE_URL=postgresql://app:<強パスワード>@127.0.0.1:5432/site_risk_checker
OCSRC_DB_CHECK_TIMEOUT_SECONDS=3.0
# 開発時のみのオプトイン（既定は CORS 無効・ワイルドカード拒否）
OCSRC_CORS_ORIGINS=
```

本番では `/etc/ocsrc/api.env`（root:root, 600・リポジトリ外）に配置し、systemd の `EnvironmentFile` で注入する。

### 21.2 配信サーバ（`frontend/server.mjs`）

```env
PORT=8700                                   # 待受ポート
HOST=0.0.0.0                                # バインドアドレス
DIST=./dist                                 # 配信ディレクトリ
OCSRC_BACKEND_ORIGIN=http://127.0.0.1:8000  # /api/* の中継先（SSRF 防止のため env 固定）
OCSRC_PROXY_TIMEOUT_MS=10000                # 中継アイドルタイムアウト
```

### 21.3 フロントエンド（ビルド時・Vite）

```env
VITE_OCSRC_BACKEND_URL=   # KSJ バックエンド直結 URL（任意）。優先順位: SCR-008 カスタム URL > 本値 > 未設定 = same-origin 既定（/api プロキシ経由・Issue #57）
VITE_SHOW_DUMMY=          # ダミー案件表示（未指定: dev=表示 / 本番=非表示）
```

### 21.4 Docker Compose（`infra/.env`・コミット禁止）

```env
OCSRC_DB_NAME=site_risk_checker
OCSRC_DB_USER=app
OCSRC_DB_PASSWORD=<強パスワードへ必ず変更>   # .env.example の dev_only_password は開発専用
```

> ⚠️ `OCSRC_DB_PASSWORD` の本番 override は必須（§15.2.4、[`docs/deploy-backend.md`](deploy-backend.md)）。

---

## 22. 運用設計

### 22.1 常駐サービス（現行）

| サービス | 形態 | 確認コマンド |
|---|---|---|
| ocsrc-web | systemd | `systemctl status ocsrc-web` / `journalctl -u ocsrc-web -f` |
| ocsrc-api | systemd | `systemctl status ocsrc-api` / `curl http://127.0.0.1:8000/livez`・`curl http://127.0.0.1:8000/readyz` |
| ocsrc-db | docker compose | `docker compose ps`（infra/） |

### 22.2 日次運用

1. ヘルスチェック（`/readyz` の `db: ok`（HTTP 200）確認、SCR-006 接続テスト）
2. エラーログ確認（journald）
3. レート制限発生状況確認（SCR-007 取得ログ）

### 22.3 月次運用

1. データソース台帳更新
2. 国土数値情報等の更新有無確認（更新時は `python -m app.ingest` で再取込）
3. Dependabot PR・CI security ジョブの結果確認
4. AIメモ品質確認
5. 確認優先度ルールの見直し

### 22.4 バックアップ

| 対象 | 頻度 | 備考 |
|---|---|---|
| PostGIS（ksj_features） | 取込時 | 元 GeoJSON を保持していれば `app.ingest` で再構築可能 |
| 利用者データ（localStorage） | 利用者操作 | SCR-000 のエクスポート機能で JSON 出力（実データのみ） |
| 設定ファイル | Git 管理 | 機密情報（`infra/.env` / `/etc/ocsrc/api.env`）は除外・別管理 |

---

## 23. 実装優先順位（実績）

| Sprint | 内容 | 状況 |
|---|---|---|
| Sprint 1 | 画面モック（地点入力・地図・リスク一覧・AIメモ・Markdown出力） | ✅ 完了 |
| Sprint 2 | 基本API接続（Nominatim / Overpass / Open-Meteo・接続ログ・部分結果） | ✅ 完了 |
| Sprint 3 | GISデータ連携（PostGIS・KSJ取込・空間検索・ハザードレイヤ・品質表示） | ✅ 完了 |
| Sprint 4 | AIメモ・出力（AI生成・禁止表現チェック・Markdown / CSV・受入テスト） | ✅ 完了 |
| Phase 3 | 気象庁 警報・注意報連携 | ✅ 完了（xROAD / PLATEAU は見送り・§8.7/8.8） |
| Phase 4+ | 複数候補地比較・案件管理・レビュー（バックエンド中心構成の再評価） | ⏳ 未着手 |

---

## 24. 既知リスクと対策

| リスク | 対策 |
|---|---|
| 外部API仕様変更 | Adapter方式、接続テスト、API台帳管理 |
| OSM大量アクセス制限 | キャッシュ、自前データ、利用頻度制御 |
| データ未整備地域 | D：データ不足として表示 |
| 断定表現による誤解 | UI文言制御、AI禁止語チェック、免責表示 |
| 地図上の見た目だけで判断される | 根拠・出典・取得日時を必ず表示 |
| 公開前案件の地点情報漏えい | サーバ側に保存しない設計、出力時の公開区分選択、LAN 外公開時の追加対策（§15.2.3） |
| 災害情報の解釈ミス | 専門確認・自治体資料確認を促す |
| 運用境界の逸脱（意図しない外部公開） | §15.2 の運用境界を README にも明記し、公開前チェックリスト化 |

---

## 25. 参考情報・出典候補

- OpenStreetMap Foundation / Nominatim Usage Policy
  - https://operations.osmfoundation.org/policies/nominatim/
- Open-Meteo Forecast API Documentation
  - https://open-meteo.com/en/docs
- Open-Meteo Geocoding API Documentation
  - https://open-meteo.com/en/docs/geocoding-api
- 国土交通省 国土数値情報ダウンロードサイト
  - https://nlftp.mlit.go.jp/ksj/
- 国土数値情報 利用規約
  - https://nlftp.mlit.go.jp/ksj/other/agreement.html
- 国土地理院 地理院タイル仕様
  - https://maps.gsi.go.jp/development/siyou.html
- 国土地理院 地理院タイル一覧
  - https://maps.gsi.go.jp/development/ichiran.html
- ハザードマップポータルサイト オープンデータ配信
  - https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/opendata.html
- 国土交通省 PLATEAU
  - https://www.mlit.go.jp/plateau/
- G空間情報センター PLATEAUポータル
  - https://front.geospatial.jp/plateau_portal_site/
- 国土交通省 xROAD 道路データプラットフォーム
  - https://www.xroad.mlit.go.jp/
- 国土交通省 交通量API 報道発表
  - https://www.mlit.go.jp/report/press/road01_hh_001930.html

---

## 26. 結論

本詳細仕様（v1.1）では、`Open Civil Site Risk Checker` の実装実態を正として、構成、データ設計、API設計、画面設計、リスク確認ロジック、セキュリティ設計、運用境界を定義した。

現行実装は、断定判定ではなく確認優先度と根拠提示を重視した**フロントエンド中心（クライアント完結）設計**であり、バックエンドは国土数値情報の空間検索補助に限定している。無認証・HTTP 平文は信頼 LAN 内運用を前提とした設計判断であり、境界を超える場合の必須要件を §15.2 に定めた。

バックエンド中心構成（認証・案件管理・監査）は Phase 4+ の将来計画として保持し、サーバ側に利用者データを持つ必要が生じた段階で再評価する。

小さく作って、見せて、現場からフィードバックを得て育てる。土木DXではこの進め方がかなり強い。

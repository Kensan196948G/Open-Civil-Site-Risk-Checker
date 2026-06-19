# Open Civil Site Risk Checker 詳細仕様設計書

## 1. 文書情報

| 項目 | 内容 |
|---|---|
| システム名 | Open Civil Site Risk Checker |
| 日本語名 | 工事候補地リスク自動チェックシステム |
| リポジトリ | `Open-Civil-Site-Risk-Checker` |
| リポジトリURL | `https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker.git` |
| 文書種別 | 詳細仕様設計書 |
| 版数 | v1.0 |
| 作成日 | 2026-06-18 |
| 前提文書 | `Open-Civil-Site-Risk-Checker_Requirements.md` |

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

---

## 3. システム全体構成

### 3.1 推奨アーキテクチャ

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

### 3.2 初期モック構成

| 項目 | 推奨 |
|---|---|
| フロントエンド | Next.js / React |
| 地図ライブラリ | Leaflet または MapLibre GL JS |
| バックエンド | FastAPI / Python |
| DB | SQLiteまたはPostgreSQL。検証段階からPostgreSQL + PostGIS推奨 |
| デプロイ | Cloudflare Pages + APIは別ホスト、または単体Docker |
| 認証 | 初期モックは簡易認証。本格利用時はEntra ID連携 |

### 3.3 本格利用候補構成

| 項目 | 推奨 |
|---|---|
| フロントエンド | Next.js |
| API | FastAPI |
| DB | Azure Database for PostgreSQL + PostGIS |
| 認証 | Entra ID / OIDC |
| シークレット管理 | Azure Key Vaultまたは環境変数管理 |
| 監視 | Azure Monitor / Application Insights相当 |
| CI/CD | GitHub Actions |
| コンテナ | Docker / Docker Compose |

---

## 4. リポジトリ構成案

```text
Open-Civil-Site-Risk-Checker/
├── README.md
├── docs/
│   ├── requirements.md
│   ├── detailed-specification.md
│   ├── api-sources.md
│   ├── risk-rules.md
│   └── screen-design.md
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── map/
│   │   ├── api/
│   │   └── types/
│   └── public/
├── backend/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routers/
│   │   ├── services/
│   │   ├── adapters/
│   │   ├── risk_engine/
│   │   ├── ai_memo/
│   │   ├── db/
│   │   └── schemas/
│   └── tests/
├── infra/
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── .env.example
├── data/
│   ├── raw/
│   ├── processed/
│   └── samples/
└── scripts/
    ├── import_ksj_data.py
    ├── check_api_status.py
    └── seed_sample_data.py
```

---

## 5. 主要モジュール仕様

### 5.1 フロントエンドモジュール

| モジュール | 内容 |
|---|---|
| LocationInput | 住所・緯度経度・半径入力 |
| MapViewer | 地図、地点、検索範囲、レイヤ表示 |
| LayerControl | 道路、河川、災害、地形、施設、気象レイヤ切替 |
| RiskSummary | 確認優先度サマリー表示 |
| RiskList | カテゴリ別リスク一覧 |
| RiskDetailDrawer | 根拠データ、距離、出典、取得日時の詳細表示 |
| AiMemoPanel | AI調査メモ表示・編集 |
| ExportPanel | Markdown / CSV出力 |
| DataSourceStatus | API接続状態表示 |

### 5.2 バックエンドモジュール

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

### 6.1 地点リスク確認フロー

```text
1. ユーザー入力
   - 住所または緯度経度
   - 検索半径
   - 確認カテゴリ

2. 入力検証
   - 住所空欄チェック
   - 緯度経度範囲チェック
   - 半径上限チェック

3. ジオコーディング
   - 住所 → 緯度経度
   - 候補が複数ある場合は候補一覧返却

4. 解析範囲生成
   - 中心点
   - バッファ範囲
   - bbox

5. データ取得
   - OSM
   - Open-Meteo
   - 国土数値情報
   - ハザードマップ
   - GSI Tile
   - PLATEAU
   - xROAD

6. データクレンジング
   - 座標系統一
   - 重複除外
   - 取得失敗整理
   - 出典・取得日時付与

7. 空間解析
   - 距離計算
   - 範囲内検索
   - ポリゴン重なり確認
   - 最近傍検索

8. 確認優先度計算
   - カテゴリ別ルール適用
   - データ品質補正

9. 結果保存
   - analysis_runs
   - findings
   - evidence
   - api_logs

10. 画面返却
   - 地図表示用GeoJSON
   - リスク一覧
   - AIメモ生成用材料

11. AIメモ生成
   - 断定表現を避けた調査メモ
```

---

## 7. 外部API / データソースアダプタ仕様

### 7.1 共通アダプタインターフェース

```python
class DataSourceAdapter:
    source_key: str
    source_name: str

    async def health_check(self) -> HealthCheckResult:
        pass

    async def fetch(self, request: SiteAnalysisRequest) -> AdapterFetchResult:
        pass

    def normalize(self, raw_data: dict) -> NormalizedLayer:
        pass
```

### 7.2 AdapterFetchResult

```json
{
  "source_key": "osm_overpass",
  "status": "success | partial | failed | skipped",
  "fetched_at": "2026-06-18T10:00:00+09:00",
  "license": "ODbL",
  "attribution": "© OpenStreetMap contributors",
  "features": [],
  "errors": [],
  "warnings": []
}
```

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
| 用途 | 河川、行政区域、土地利用、公共施設、災害関連データ |
| 方式 | 事前ダウンロード + ローカルDB検索 |
| 形式 | Shapefile、GeoJSON、XML等 |
| DB | PostgreSQL + PostGIS |
| 更新 | 管理者が定期取込。更新日を保持 |
| 注意 | データ種別により整備年度・属性・精度が異なる |

#### 取込処理

```text
1. ダウンロード対象データの登録
2. ZIP取得
3. 展開
4. 文字コード判定
5. GeoJSON変換
6. SRID統一
7. PostGIS取込
8. 空間インデックス作成
9. 取得履歴登録
```

### 8.5 ハザードマップポータル Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 洪水、土砂災害、津波等の重ね合わせ表示 |
| 方式 | タイル表示、WMTSメタデータ参照、または関連データのローカル取込 |
| 表示 | 地図レイヤ重ね合わせ |
| 注意 | タイル表示は視覚確認向け。厳密な判定には元データ・自治体資料確認が必要 |
| 出典 | ハザードマップポータルサイトとして表示 |

### 8.6 国土地理院 地理院タイル Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 背景地図、標高、地形、陰影起伏等 |
| 方式 | タイル取得 |
| 表示 | MapViewerのベースマップ / レイヤ |
| 注意 | タイル種別ごとに利用条件・出典表記を確認 |
| 出典 | 国土地理院または地理院タイル |

### 8.7 PLATEAU Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 3D都市モデル、建物・都市構造確認 |
| 初期実装 | 対象地域のデータ有無確認、リンク表示、簡易属性表示 |
| 将来実装 | 建物高さ、周辺建物密度、3D表示 |
| 注意 | 地域により整備状況が異なる |

### 8.8 xROAD Adapter

| 項目 | 内容 |
|---|---|
| 用途 | 道路データ、交通量、道路関係データ確認 |
| 初期実装 | xROAD閲覧リンク、利用可能データ確認、交通量API候補登録 |
| 将来実装 | API連携、道路交通量、旅行速度、道路施設情報の統合表示 |
| 注意 | API利用規約への同意が必要な場合がある。対象道路範囲に注意 |

---

## 9. データベース設計

### 9.1 ER概要

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

### 9.2 テーブル一覧

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

### 9.3 analysis_runs

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | 分析ID |
| user_id | UUID | 実行ユーザー |
| title | VARCHAR | 分析名 |
| input_type | VARCHAR | address / coordinates |
| search_radius_m | INTEGER | 検索半径 |
| status | VARCHAR | running / completed / partial / failed |
| started_at | TIMESTAMPTZ | 開始日時 |
| completed_at | TIMESTAMPTZ | 完了日時 |
| created_at | TIMESTAMPTZ | 作成日時 |

### 9.4 input_locations

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | 地点ID |
| analysis_run_id | UUID | 分析ID |
| raw_input | TEXT | 入力住所または座標 |
| normalized_address | TEXT | 正規化住所 |
| latitude | NUMERIC | 緯度 |
| longitude | NUMERIC | 経度 |
| geom | GEOMETRY(Point, 4326) | PostGIS地点 |
| geocoder | VARCHAR | geocoder名 |
| confidence_note | TEXT | 位置確認メモ |
| created_at | TIMESTAMPTZ | 作成日時 |

### 9.5 data_sources

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | データソースID |
| source_key | VARCHAR | 識別子 |
| source_name | VARCHAR | 名称 |
| provider | VARCHAR | 提供元 |
| source_type | VARCHAR | api / tile / file / db |
| base_url | TEXT | ベースURL |
| license | TEXT | ライセンス |
| attribution | TEXT | 出典表示 |
| update_frequency | VARCHAR | 更新頻度 |
| reliability_rank | VARCHAR | A / B / C / D |
| enabled | BOOLEAN | 有効フラグ |
| created_at | TIMESTAMPTZ | 作成日時 |
| updated_at | TIMESTAMPTZ | 更新日時 |

### 9.6 findings

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | 確認結果ID |
| analysis_run_id | UUID | 分析ID |
| category | VARCHAR | roads / rivers / hazard / terrain / weather / facilities / data_quality |
| item_key | VARCHAR | 確認項目キー |
| priority | VARCHAR | A / B / C / D |
| title | VARCHAR | 表示タイトル |
| summary | TEXT | 概要 |
| distance_m | NUMERIC | 距離。該当しない場合NULL |
| geometry | GEOMETRY | 関連形状 |
| status | VARCHAR | found / not_found / no_data / failed |
| caution | TEXT | 注意事項 |
| created_at | TIMESTAMPTZ | 作成日時 |

### 9.7 evidence_items

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | 根拠ID |
| finding_id | UUID | 確認結果ID |
| source_key | VARCHAR | データソースキー |
| layer_name | VARCHAR | レイヤ名 |
| source_feature_id | VARCHAR | 元データID |
| properties | JSONB | 属性情報 |
| fetched_at | TIMESTAMPTZ | 取得日時 |
| source_updated_at | TIMESTAMPTZ | データ更新日 |
| attribution | TEXT | 出典 |
| quality_note | TEXT | 品質メモ |

### 9.8 ai_memos

| カラム | 型 | 内容 |
|---|---|---|
| id | UUID | AIメモID |
| analysis_run_id | UUID | 分析ID |
| memo_markdown | TEXT | AI調査メモ本文 |
| model_name | VARCHAR | 使用モデル |
| prompt_version | VARCHAR | プロンプト版数 |
| safety_checked | BOOLEAN | 断定表現チェック済み |
| created_at | TIMESTAMPTZ | 作成日時 |

---

## 10. API設計

### 10.1 API一覧

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

### 10.2 POST `/api/site-analyses`

#### Request

```json
{
  "input_type": "address",
  "address": "東京都千代田区霞が関2丁目1番3号",
  "latitude": null,
  "longitude": null,
  "search_radius_m": 500,
  "categories": ["roads", "rivers", "hazard", "terrain", "weather", "facilities"]
}
```

#### Response

```json
{
  "analysis_run_id": "uuid",
  "status": "running",
  "message": "地点確認を開始しました。外部APIの取得状況により部分結果から表示します。"
}
```

### 10.3 GET `/api/site-analyses/{id}`

#### Response

```json
{
  "analysis_run_id": "uuid",
  "status": "completed",
  "input_location": {
    "normalized_address": "東京都千代田区霞が関...",
    "latitude": 35.0,
    "longitude": 139.0,
    "search_radius_m": 500
  },
  "summary": {
    "priority_a_count": 1,
    "priority_b_count": 3,
    "priority_c_count": 8,
    "priority_d_count": 2,
    "data_quality_note": "一部データソースで取得失敗があります。"
  },
  "findings": [],
  "map_layers": [],
  "data_sources": []
}
```

### 10.4 Findingオブジェクト

```json
{
  "id": "uuid",
  "category": "rivers",
  "priority": "B",
  "title": "周辺に河川データがあります",
  "summary": "検索半径500m以内に河川関連データが存在します。現地条件と管理者資料の確認を推奨します。",
  "status": "found",
  "distance_m": 120.5,
  "caution": "公開データの整備時点と現況が異なる可能性があります。",
  "evidence": [
    {
      "source_key": "ksj_river",
      "layer_name": "河川データ",
      "fetched_at": "2026-06-18T10:00:00+09:00",
      "attribution": "国土数値情報"
    }
  ]
}
```

---

## 11. 確認優先度ロジック

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

AIメモ生成後に、以下の表現が含まれる場合は再生成または置換する。

| 禁止語 | 置換候補 |
|---|---|
| 安全です | 追加確認事項は限定的です |
| 危険です | 専門確認を優先してください |
| 問題ありません | 公開データ上、明確な該当情報は確認されませんでした |
| 施工できます | 施工条件の詳細確認が必要です |
| リスクはありません | 該当データは確認されませんでした |

---

## 13. 画面仕様

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

### 15.1 認証

| 環境 | 認証方式 |
|---|---|
| ローカル開発 | 認証なし、または開発用簡易認証 |
| モック公開 | Basic認証または限定URL |
| 社内検証 | Entra ID / OIDC |
| 本番 | Entra ID / OIDC + ロール制御 |

### 15.2 認可

| ロール | 権限 |
|---|---|
| viewer | 検索・閲覧 |
| editor | メモ編集・出力 |
| reviewer | コメント・確認済み登録 |
| admin | データソース管理、ログ閲覧 |

### 15.3 機微情報対策

1. 住所検索履歴は必要最小限の保存にする。
2. 民間案件の候補地は社外秘として扱う。
3. エクスポート時に公開区分を選択できるようにする。
4. 操作ログを記録する。
5. APIキーやトークンはリポジトリに保存しない。
6. `.env.example` にはダミー値のみ記載する。

---

## 16. ログ設計

### 16.1 API実行ログ

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

### 16.2 操作ログ

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
| レート制限 | データソースの利用制限に達しました。時間をおいて再実行してください。 | キャッシュ表示 |
| DB接続エラー | 保存処理に失敗しました。管理者に連絡してください。 | ログ出力 |
| AI生成失敗 | AI調査メモを生成できませんでした。確認結果一覧は利用できます。 | AIメモのみ失敗 |
| データ未整備 | この地点では対象データが未整備の可能性があります。 | D表示 |

---

## 18. テスト設計

### 18.1 単体テスト

| 対象 | テスト内容 |
|---|---|
| 入力検証 | 住所、緯度経度、半径、カテゴリ |
| Adapter | 正常応答、失敗、タイムアウト、空結果 |
| RiskEngine | 優先度A/B/C/Dの分類 |
| DataQualityService | データなし、取得失敗、古いデータの分類 |
| AiMemoService | 禁止表現チェック、免責文付与 |
| ExportService | Markdown / CSV形式 |

### 18.2 結合テスト

| ケース | 内容 |
|---|---|
| IT-001 | 住所入力からリスク一覧表示まで |
| IT-002 | 緯度経度入力からリスク一覧表示まで |
| IT-003 | 外部APIの一部失敗時の部分表示 |
| IT-004 | 地図レイヤ切替 |
| IT-005 | AI調査メモ生成 |
| IT-006 | Markdown出力 |

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

### 19.1 GitHub Actions案

```yaml
name: ci

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r backend/requirements.txt
      - run: pytest backend/tests

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run build
```

---

## 20. Docker Compose案

```yaml
services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: site_risk_checker
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app_password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build:
      context: .
      dockerfile: infra/Dockerfile.backend
    env_file:
      - .env
    ports:
      - "8000:8000"
    depends_on:
      - db

  frontend:
    build:
      context: .
      dockerfile: infra/Dockerfile.frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  pgdata:
```

---

## 21. 環境変数案

```env
APP_ENV=development
APP_NAME=Open Civil Site Risk Checker
DATABASE_URL=postgresql+asyncpg://app:app_password@db:5432/site_risk_checker

NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
OVERPASS_BASE_URL=https://overpass-api.de/api/interpreter
OPEN_METEO_BASE_URL=https://api.open-meteo.com

HTTP_USER_AGENT=OpenCivilSiteRiskChecker/0.1 contact@example.com
REQUEST_TIMEOUT_SECONDS=20
API_CACHE_TTL_SECONDS=86400

AI_PROVIDER=none
AI_MODEL=
AI_API_KEY=

AUTH_MODE=none
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
```

---

## 22. 運用設計

### 22.1 日次運用

1. API接続状態確認
2. エラーログ確認
3. レート制限発生状況確認
4. 失敗データソースの再実行

### 22.2 月次運用

1. データソース台帳更新
2. 国土数値情報等の更新有無確認
3. 利用件数確認
4. AIメモ品質確認
5. 確認優先度ルールの見直し

### 22.3 バックアップ

| 対象 | 頻度 | 備考 |
|---|---|---|
| PostgreSQL | 日次 | 分析履歴、データソース台帳、リスク結果 |
| 取込GISデータ | 取込時 | raw / processed を分離 |
| 設定ファイル | Git管理 | 機密情報は除外 |
| 出力レポート | 必要に応じて | 保存期間を定義 |

---

## 23. 実装優先順位

### 23.1 Sprint 1：画面モック

1. 地点入力画面
2. 地図表示
3. ダミーリスク一覧
4. AI調査メモの固定テンプレート
5. Markdown出力モック

### 23.2 Sprint 2：基本API接続

1. Nominatim住所検索
2. Overpass周辺道路取得
3. Open-Meteo気象取得
4. API接続ログ
5. 部分結果表示

### 23.3 Sprint 3：GISデータ連携

1. PostgreSQL + PostGIS構築
2. 国土数値情報サンプル取込
3. 空間検索
4. ハザード系レイヤ表示
5. データ品質表示

### 23.4 Sprint 4：AIメモ・出力

1. AIメモ生成
2. 禁止表現チェック
3. Markdown出力
4. CSV出力
5. 受入テスト

---

## 24. 既知リスクと対策

| リスク | 対策 |
|---|---|
| 外部API仕様変更 | Adapter方式、接続テスト、API台帳管理 |
| OSM大量アクセス制限 | キャッシュ、自前データ、利用頻度制御 |
| データ未整備地域 | D：データ不足として表示 |
| 断定表現による誤解 | UI文言制御、AI禁止語チェック、免責表示 |
| 地図上の見た目だけで判断される | 根拠・出典・取得日時を必ず表示 |
| 公開前案件の地点情報漏えい | 認証、権限、ログ、出力制限 |
| 災害情報の解釈ミス | 専門確認・自治体資料確認を促す |

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

本詳細仕様では、`Open Civil Site Risk Checker` を、公開データ横断型の地点リスク確認アプリとして実装するための構成、データ設計、API設計、画面設計、リスク確認ロジックを定義した。

初期版では、断定判定ではなく、確認優先度と根拠提示を重視する。

これにより、非IT技術者にとって分かりやすく、IT・DX部門にとっては公開API連携とGIS基盤構築の足場になる。

小さく作って、見せて、現場からフィードバックを得て育てる。土木DXではこの進め方がかなり強い。

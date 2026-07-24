# 🐘 Neon PostgreSQL 運用リファレンス

本番データの正本である Neon プロジェクトの構成・監視・バックアップ方針をまとめる。
セットアップ手順（初回切替）は [`deploy-backend.md`](./deploy-backend.md#-マネージド-db neon-を使う) を参照。本書は「稼働中の Neon をどう把握し、どう守るか」に焦点を当てる。

## 📌 プロジェクト概要

| 項目 | 値 |
|---|---|
| プロジェクト名 | `Open-Civil-Site-Risk-Checker` |
| プロジェクト ID | `polished-pond-79522907`（Neon コンソール URL に含まれる。秘密情報ではないが不用意な共有は避ける） |
| 組織 | Ken Mizrach（`org-little-violet-74140600`） |
| リージョン | `aws-us-east-2` |
| PostgreSQL | 17 系 |
| ブランチ構成 | `main` のみ（`primary`・`default`・`protected: false`） |
| History retention | 86400 秒（24 時間の Point-in-Time Restore が可能） |

> ⚠️ 同一組織配下に `Civil-Weather-Water-Decision`・`ArcSphere-Civil-Twin`・`Mirai-Info`・`Mirai-ITSM-Management` など類似名の Neon プロジェクトが並存する。操作対象は必ず **プロジェクト名の完全一致**（`Open-Civil-Site-Risk-Checker`）で確認してから行うこと。

## 🗄️ スキーマ・データ

`neondb` データベースの `public` スキーマに PostGIS 拡張と業務テーブルが存在する。

| オブジェクト | 種別 | 用途 |
|---|---|---|
| `ksj_features` | TABLE（業務データ） | 国土数値情報（KSJ）由来の地物データ。dataset 列でデータ種別を区別する汎用格納テーブル |
| `spatial_ref_sys` | TABLE（PostGIS標準） | 空間参照系定義 |
| `geometry_columns` / `geography_columns` | VIEW（PostGIS標準） | geometry/geography 列のカタログビュー |
| `_postgis_*` / `_st_*` 等多数 | FUNCTION（PostGIS標準） | PostGIS 組み込み関数群（変更不要） |

### `ksj_features` の列構成

| 列 | 型 | 内容 |
|---|---|---|
| `id` | bigint | 主キー |
| `dataset` | text | データセット種別（例: `river`） |
| `name` | text | 地物名 |
| `attrs` | jsonb | 出典側の属性を柔軟に保持（GeoJSON properties 相当） |
| `source` | text | 出典・ライセンス表記 |
| `source_updated_at` | text | 出典側の更新表記（自由形式） |
| `retrieved_at` | timestamptz | 取得日時 |
| `geom` | geometry（PostGIS） | 空間ジオメトリ |

### 現在投入済みデータ（2026-07-14 時点で確認）

| dataset | 件数 | 最終取得日時 |
|---|---|---|
| `river`（河川、国土数値情報 W05 由来） | 2,937 | 2026-07-11T09:48:18Z |

投入コマンドの実例は `deploy-backend.md` の Neon セットアップ手順内（`app.ingest` 呼び出し）を参照。土砂災害・浸水想定区域など他の KSJ データセットは本書作成時点で未投入。

## 🔐 接続・認証

- 接続文字列（DSN）は `/etc/ocsrc/api.env` の `OCSRC_DATABASE_URL` にのみ保持し、Git・ログ・Issue・README には一切出力しない。
- 接続は `sslmode=require` で TLS 必須。
- CTO（Claude Code）が使う Neon MCP 接続は読み取り・SQL 実行が可能だが、`DROP` / `DELETE` / `TRUNCATE` / `UPDATE`（WHERE無し）等の破壊的操作は自律実行しない。実行が必要な場合は必ずユーザーに確認する。

## 💾 バックアップ・リストア

Neon はブランチベースの PITR（Point-in-Time Restore）を標準提供する。

| 項目 | 内容 |
|---|---|
| 保持期間 | 24 時間（`history_retention_seconds: 86400`） |
| リストア方法 | Neon コンソールで対象ブランチを任意時刻に「Restore」するか、その時点を親とする新規ブランチを作成して検証後に切替 |
| 破壊的操作前の備え | 大きなスキーマ変更やデータ投入の前に、一時ブランチ（`create_branch`）を切って検証してから `main` に適用するのが安全 |
| 制約 | 24 時間より前の状態には戻せない。重大な障害復旧を伴う変更は事前に影響範囲を確認すること |

## 📊 監視・性能の現状と既知のギャップ

| 項目 | 状態 |
|---|---|
| ストレージ使用量 | 約 43.5 MB（`synthetic_storage_size`、2026-07-14 時点） |
| Compute 使用量（当月） | 約 3,856 秒（≈ 1.07 時間）、autoscaling `min=1CU / max=1CU` |
| クォータリセット | 毎月 1 日（`quota_reset_at`） |
| スロークエリ監視 | ⚠️ **`pg_stat_statements` 拡張が未インストール**。`list_slow_queries` 実行時に `NotFoundError` を確認済み（2026-07-14） |

### 改善提案（未実施・要ユーザー判断）

`pg_stat_statements` の導入はデータを破壊しない追加的な拡張だが、本番 DB へのスキーマ変更に変わりないため、CTO からは自律実行せず提案に留める。

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

導入後は `list_slow_queries`（Neon MCP）や Neon コンソールの Insights から遅いクエリを継続監視できるようになる。

## 🧭 運用チェックリスト（Monitor フェーズで確認する項目）

- [ ] `describe_project` でブランチ数・状態（`ready` であること）を確認
- [ ] `run_sql` で `ksj_features` の件数・最終取得日時に極端な変化がないか確認
- [ ] ストレージ使用量が想定外に増加していないか確認
- [ ] （導入後）`list_slow_queries` でスロークエリの有無を確認
- [ ] プロジェクト名の完全一致を必ず確認してから操作する（同一組織内に類似名プロジェクトが複数存在するため）

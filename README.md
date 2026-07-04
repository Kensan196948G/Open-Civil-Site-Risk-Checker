# Open Civil Site Risk Checker（工事候補地リスクチェッカー）

住所または緯度経度を入力すると、工事候補地周辺の **道路・河川・災害・地形・気象・施設** の公開データを横断取得し、**確認優先度（A〜D）つき**で一覧化する初期調査支援アプリです。

> **本ツールは施工可否・安全性・法的適合性を断定しません。**
> 「データなし」は「リスクなし」を意味しません。候補地検討の初期段階で「追加確認すべき論点」を早く見つけることを目的とします。

このリポジトリは Claude Design のデザインプロトタイプ（`docs/site-risk-checker.design.dc.html`）を、実 API 連携つきの動く Web アプリとして実装した **MVP（Phase 1）** です。

---

## クイックスタート

```bash
cd frontend
npm install
npm run dev          # 開発サーバ（http://localhost:5173）
```

その他のスクリプト:

```bash
npm run build        # 型チェック + 本番ビルド（dist/）
npm run preview      # ビルド成果物のプレビュー
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # ユニットテスト（vitest, 1回実行）
npm run test:watch   # ユニットテスト（vitest, watch）
npm run test:smoke   # スモークテスト（esbuild ランナー / 制約環境向け）
```

ブラウザで開いたら、**「サンプル地点で試す（霞が関）」** ボタンで一連の流れ（取得 → 地図 → 確認結果 → AIメモ → レポート）を確認できます。

---

## 常駐サービス（WebUI 公開）

ビルド成果物（`frontend/dist`）を依存ゼロの静的サーバ（`frontend/server.mjs`）で配信し、常時起動します。サーバは `HOST=0.0.0.0` でバインドするため、**ホストに自動割当された IP（DHCP）を含む全インタフェース**で到達でき、ポートは**競合しない番号を自動選択**します（既定は 8700〜8799 から空きを探索）。

現在の稼働 URL（このホストの場合）:

| 種別 | URL |
|---|---|
| LAN（自動割当 IP） | `http://192.168.0.143:8700/` |
| ローカル | `http://127.0.0.1:8700/` |
| ヘルスチェック | `http://127.0.0.1:8700/healthz` → `ok` |

### A. systemd（既定・稼働中）

```bash
scripts/install-systemd.sh          # ビルド → ユニット生成 → enable --now（ポート自動選択）
PORT=8750 scripts/install-systemd.sh # ポートを明示する場合
scripts/uninstall-systemd.sh        # 停止・無効化・ユニット削除
```

`/etc/systemd/system/ocsrc-web.service` を生成し、`enable`（再起動後も自動起動）＋ `Restart=always`（異常終了時も自動復帰）で常駐します。

```bash
systemctl status ocsrc-web      # 状態確認
sudo systemctl restart ocsrc-web
journalctl -u ocsrc-web -f      # ログ追従
```

> コード更新後は `scripts/install-systemd.sh` を再実行（再ビルド＋再起動）すれば反映されます。ポートは既存ユニットの値を引き継ぎます。

### B. Docker（代替）

systemd の代わりに Docker で常駐させる場合（`restart: always` で再起動後も自動起動）:

```bash
cd infra
OCSRC_PORT=8700 docker compose up -d --build
docker compose logs -f
docker compose down               # 停止
```

> systemd と Docker は同一ポートを使うため、**どちらか一方**を使用してください。

### C. ロールバック（切り戻し）手順

デプロイ後に問題が見つかった場合は、**コードを直前の正常版へ戻して再ビルド・再起動**します。履歴改変（force push）は行わず、`git revert` で戻します。

```bash
# 1. 戻したいコミットを特定（直前のマージなら HEAD）
git log --oneline -5

# 2. 対象コミットを打ち消すコミットを作成（マージコミットは -m 1）
git revert <commit>            # 通常コミット
git revert -m 1 <merge-commit> # マージコミット

# 3. 再ビルド + 再起動（稼働方式に応じてどちらか）
scripts/install-systemd.sh                    # systemd の場合（再ビルド + 再起動）
cd infra && docker compose up -d --build      # Docker の場合
```

確認:

```bash
curl -fsS http://127.0.0.1:8700/healthz   # → ok
systemctl status ocsrc-web                # systemd の場合
docker compose ps                         # Docker の場合
```

> 本アプリは静的 SPA（サーバ側状態なし・DB なし）のため、ロールバックはビルド成果物の差し替えのみで完結します。利用者データは各ブラウザの `localStorage` にあり、ロールバックの影響を受けません（スキーマ変更を伴う変更を戻す場合のみ、README の該当バージョンの記載を確認してください）。

---

## 実装済み機能（MVP / 受入条件 AC-001〜010 対応）

| 画面 | 内容 |
|---|---|
| SCR-000 ダッシュボード | 既定の起動画面。調査案件一覧・KPI・確認優先度の全体集計。**本番データ（実取得）案件**と**ダミー（サンプル）案件**を区別表示。JSON 取込/エクスポート対応 |
| SCR-001 地点入力 | 住所 / 緯度経度・検索半径（100m〜3km）・確認カテゴリ選択、入力検証 |
| SCR-002 リスク判定 | 地図（地理院タイル＋実ジオメトリ）、確認優先度サマリー、カテゴリ別結果一覧 |
| SCR-003 リスク詳細 | 根拠データ・出典・取得日時・距離・注意事項・コメント欄（右ドロワー） |
| SCR-004 AI調査メモ | 断定表現を避けた調査メモを自動生成・編集・再生成。**AI生成（Anthropic Claude・SCR-008 の保存キー利用）**に対応：テンプレートを土台に生成し、禁止表現チェック + 免責文必須化を通す |
| SCR-005 レポート出力 | Markdown / CSV 出力（公開区分つき、UTF-8 BOM 付き CSV） |
| SCR-006 データソース管理 | 接続状態・利用条件の台帳、接続テスト（実疎通） |
| SCR-007 取得ログ | 実行履歴（成功 / 失敗 / タイムアウト / スキップを区別） |
| SCR-008 システム設定 | AI設定（**Anthropic（Claude）専用**・APIキー入力/クリア/接続テスト/保存。**キーはブラウザの localStorage のみに保存**）+ アプリ情報 |

### 連携している公開データソース（ブラウザ直接呼び出し）

| ソース | 用途 | 連携状態 |
|---|---|---|
| OpenStreetMap / Nominatim | 住所ジオコーディング | ✅ 実連携 |
| OpenStreetMap / Overpass | 周辺道路・水域・施設・駅（実距離計測） | ✅ 実連携 |
| Open-Meteo | 7日予報（強雨・強風の抽出） | ✅ 実連携 |
| 国土地理院 地理院タイル | 背景地図（淡色/標準/写真）・標高 | ✅ 実連携 |
| ハザードマップポータル | 洪水浸水想定・土砂災害の重ね合わせタイル | ✅ 実連携（視覚確認向け） |
| 国土数値情報 (KSJ) | 河川・施設（ローカルDB / PostGIS 空間検索） | 🟡 条件付き実連携（`VITE_OCSRC_BACKEND_URL` 設定時・Phase 2） |
| PLATEAU | 3D都市モデル | ⏳ タイムアウト再現（取得失敗の扱いを実証） |
| xROAD | 道路交通量 | ⏸ 未連携（利用規約同意が必要） |

> ハザードの重なり判定はクライアント側では行わず、タイル重ね合わせによる**視覚確認**として表示します（出典明示・断定回避）。KSJ / PLATEAU / xROAD は「取得失敗・未連携」を誠実に区別表示します（要件 FR-503 / NFR-504）。

---

## 品質ゲート / テスト

| ゲート | コマンド | 内容 |
|---|---|---|
| Lint | `npm run lint` | ESLint（TypeScript + React Hooks ルール） |
| 型チェック | `npm run typecheck` | `tsc --noEmit`（テストファイル含む） |
| ユニットテスト | `npm test` | vitest（純粋ロジックの回帰防止） |
| スモークテスト | `npm run test:smoke` | esbuild ランナー（環境非依存の二重検証） |
| ビルド | `npm run build` | 本番ビルド成功確認 |

### テスト対象（純粋ロジック）

DOM 非依存の純粋関数を中心に検証します。とくに**「断定表現を出力しない」コンプライアンス制約**（要件 §3.2）を回帰テストで保証します。

- `src/risk/memo.ts` — AI調査メモ生成（免責文の必須化・根拠データ紐付け・8セクション構成）
- `src/report/markdown.ts` — Markdown レポート（免責文・公開区分・優先度集計）
- `src/report/csv.ts` — CSV 生成（RFC 4180 エスケープ・距離丸め・出典連結）
- `src/api/geo.ts` — Haversine 距離・bbox（WGS84）
- `src/data/constants.ts` — ラベル辞書の網羅性・「該当なし／データ未取得」の区別

### 二重ランナー構成（vitest + esbuild スモーク）

テスト本体は1つ（`src/**/*.test.ts`, `import ... from 'vitest'`）で、2つのランナーから実行します。

- **vitest**（CI・通常環境）: `npm test`。
- **esbuild スモーク**（`scripts/smoke-test.mjs`）: `npm run test:smoke`。`'vitest'` を極小 shim（`scripts/smoke/shim.mjs`）に alias し、esbuild で単一バンドル化して node 上で実行します。仮想メモリ `ulimit` 制約により Vite/WASM 系ツールが起動できない環境でも、同じテスト資産をそのまま検証できます。

### CI

`.github/workflows/ci.yml` が `main` への push / PR で lint → typecheck → test → smoke → build を実行します（Node 22・`npm ci`）。リモート未接続の間はローカルで上記コマンドを実行してください。

---

## アーキテクチャ

```
frontend/src/
├── types.ts            ドメイン型（Finding / Evidence / Source / Log …）
├── store.tsx           状態管理（Context + フック。デザインの setState を移植）
├── decorate.ts         表示用の色・ラベル付与
├── cssToStyle.ts       CSS文字列 → React style 変換ヘルパ
├── data/               定数（PRIO/STATUS/ラベル）・ソース台帳・フォールバック fixtures
├── api/                ★ アダプタ層（要件 NFR-401）
│   ├── http.ts         タイムアウト・計測つき fetch ラッパ
│   ├── geo.ts          Haversine 距離・bbox（WGS84）
│   ├── nominatim.ts    ジオコーディング
│   ├── overpass.ts     道路・水域・施設取得 → 最寄り距離・確認項目化
│   ├── openMeteo.ts    気象予報 → 確認項目化
│   ├── elevation.ts    標高（地理院 → Open-Meteo フォールバック）
│   ├── ping.ts         接続テスト
│   └── runAnalysis.ts  オーケストレーション（並行取得・部分結果・誠実な失敗表現）
├── risk/memo.ts        AI調査メモ生成（断定表現を避ける）
├── report/             Markdown / CSV レポート生成
├── map/SiteMap.tsx     Leaflet 地図（地理院/ハザードタイル + 実ジオメトリ）
├── components/         Header / Sidebar / Footer / LoadingOverlay / FindingDrawer
└── screens/            SCR-001〜007 各画面
```

### 本番データ（調査案件）の投入

ダッシュボード（SCR-000）の調査案件は2種類を区別表示します。

- **実データ（本番）**：実際の地点確認結果を SCR-002 の「ダッシュボードに保存（本番データ）」で保存したもの。`localStorage`（キー `ocsrc-cases`）に永続化され、確認結果スナップショット（findings・出典・取得日時）ごと保存されるため「開く」で再取得せず復元表示します。`実データ` タグ付き・削除可。
- **ダミー（サンプル）**：`src/data/cases.ts` の6件（`isDummy:true`）。`ダミーデータ` タグを明記。「開く」は座標で実取得を実行します。**本番ビルドでは既定で非表示**（下記トグル）。

#### ダミーデータの表示トグル（本番非表示）

ダミー6件の表示有無はビルド時に切り替わります。

| ビルド | 既定の表示 | 備考 |
|---|---|---|
| `npm run dev` | 表示 | 開発・動作確認用 |
| `npm run build`（本番） | **非表示** | 実行 JS バンドルからも除去（tree-shaking） |
| `VITE_SHOW_DUMMY=true npm run build` | 表示 | デモ用に本番でもダミーを出したい場合 |
| `VITE_SHOW_DUMMY=false npm run dev` | 非表示 | 開発中に本番相当を確認したい場合 |

> 環境変数 `VITE_SHOW_DUMMY`（`'true'`/`'false'`）が最優先。未指定時は dev=表示 / 本番=非表示。`scripts/install-systemd.sh` は `npm run build`（本番）を実行するため、**常駐サービスは既定でダミー非表示**になります。

投入経路:

1. **地点確認 → 保存**：地点確認を実行し、SCR-002 右パネルの「＋ ダッシュボードに保存（本番データ）」を押す。
2. **JSON 一括取込**：ダッシュボード右上「↑ 本番データ取込」から JSON 配列を取り込む。各要素は最低 `name` / `lat` / `lon` が必要（`radius` / `counts` / `status` 等は任意、未指定は補完）。緯度経度は WGS84 範囲で検証し、範囲外は除外します（要件 NFR-501/505）。
3. **エクスポート**：「↓ エクスポート」で実データのみ JSON 出力（バックアップ・他環境移行用、ダミーは対象外）。

> データの出所は `isDummy` フラグで常に追跡可能で、集計（KPI・優先度分布）はダミー込みの全件を対象にしつつ件数の内訳（実データ / ダミー）を併記します。

### テーマ（ライト / ダーク）

ヘッダーのトグルでライト/ダークを切り替えます。構造色は CSS 変数（`src/styles.css` の `:root` / `:root[data-ocsrc-theme='dark']`）、意味色（確認優先度 A〜D・状態・案件状態）は JS のテーマ別パレット（`getPrio(theme)` 等）で解決します。地図はダーク時にタイルペインへ `filter: invert(...)` を当ててダーク地図化します。選択は `localStorage` に保存され、`data-ocsrc-theme` 属性で適用されます。

### 設計上の重要方針

1. **断定しない**：「安全 / 危険 / 施工可否 / リスクなし」を使わず、「要確認 / 追加確認推奨 / 参考情報 / データ不足」で表現する（要件 §3.2）。
2. **アダプタ方式**：データソースは `src/api/` のアダプタに分離し、追加・差し替えを容易にする（要件 NFR-401/402）。将来のバックエンド（FastAPI）へ移設しやすい契約（`AdapterResult`）を採用。
3. **出典と取得日時の明示**：すべての確認項目に根拠データ・出典・取得日時・注意事項を紐付ける（要件 NFR-301）。
4. **「該当なし」と「取得失敗」の分離**：データ整備範囲内の「該当なし」と、API 失敗・未連携を必ず区別する（要件 FR-304 / NFR-504）。

---

## バックエンド（Phase 2・開発中）

`backend/` に FastAPI バックエンド（Phase 2 scaffold）を追加しました。国土数値情報のローカル DB 化（PostgreSQL + PostGIS）と空間検索 API をここに実装していきます（Issue #4）。

```bash
cd infra
cp .env.example .env                          # DB パスワード等（コミット禁止）
docker compose --profile phase2 up -d --build # db(PostGIS) + backend を起動
curl http://127.0.0.1:8000/healthz            # → {"status":"ok","db":"ok",...}
```

- 既定の `docker compose up`（フロント配信のみ）には**影響しません**（profile 分離）
- CI に backend ジョブ（ruff / pytest + PostGIS サービスコンテナでの統合テスト）を追加済み
- 🗺️ **KSJ 空間検索（Phase 2-3/2-4 実装済み）**: `python -m app.ingest` で国土数値情報（GeoJSON）を PostGIS へ取込み、`GET /api/v1/nearby?lat=&lon=&radius_m=` で近傍の河川・施設を距離つきで返します（取込手順は `backend/data/README.md`）
- 🔌 フロントエンドはビルド時に `VITE_OCSRC_BACKEND_URL`（例 `http://127.0.0.1:8000`）を設定すると KSJ ステップが実連携になります。**未設定なら従来どおり「未連携」表示**で動作は不変です
- 詳細は `backend/README.md` を参照

---

## 今後の拡張（要件 §18 / 詳細仕様準拠）

| フェーズ | 内容 |
|---|---|
| Phase 2 | 国土数値情報・ハザードのローカルDB化（PostgreSQL + PostGIS）、FastAPI バックエンド分離 |
| Phase 3 | xROAD / PLATEAU / 河川水位・防災情報の追加連携 |
| Phase 4 | 複数候補地比較・案件管理・社内レビュー機能 |
| Phase 5 | Civil Open Data Intelligence Platform への統合 |

詳細は `docs/requirements.md` / `docs/detailed-specification.md` を参照。

---

## 出典・ライセンス表記

- © OpenStreetMap contributors（ODbL）/ Nominatim・Overpass
- Open-Meteo（CC BY 4.0）
- 国土地理院 地理院タイル（出典明示・タイル種別ごとの利用条件に従う）
- ハザードマップポータルサイト（出典明示）

各データソースの利用ポリシー（Nominatim の利用制限等）を遵守してください。

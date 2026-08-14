# Open Civil Site Risk Checker（工事候補地リスクチェッカー）

住所または緯度経度を入力すると、工事候補地周辺の **道路・河川・災害・地形・気象・施設** の公開データを横断取得し、**確認優先度（A〜D）つき**で一覧化する初期調査支援アプリです。

> **本ツールは施工可否・安全性・法的適合性を断定しません。**
> 「データなし」は「リスクなし」を意味しません。候補地検討の初期段階で「追加確認すべき論点」を早く見つけることを目的とします。

このリポジトリは Claude Design のデザインプロトタイプ（`docs/site-risk-checker.design.dc.html`）を、実 API 連携つきの動く Web アプリとして実装した **MVP（Phase 1）** です。

📁 ドキュメントの正本は `docs/` 配下です（要件定義 `docs/requirements.md` / 詳細仕様 `docs/detailed-specification.md` / 概要 `docs/overview.md`）。

---

## 🚀 クイックスタート

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

ブラウザで開いたら、**「サンプル地点で試す（霞が関）」** ボタンで一連の流れ（取得 → 地図 → 確認結果 → AIメモ → レポート）を確認できます。地図上では **「地図画像を取得」（調査パック用の地図キャプチャ・Issue #274）** も試せます。

---

## 🌐 常駐サービス（WebUI 公開）

ビルド成果物（`frontend/dist`）を依存ゼロの静的サーバ（`frontend/server.mjs`）で配信し、常時起動します。サーバは `HOST=0.0.0.0` でバインドするため、**ホストに自動割当された IP（DHCP）を含む全インタフェース**で到達でき、ポートは**競合しない番号を自動選択**します（既定は 8700〜8799 から空きを探索）。`server.mjs` は静的配信に加えて**セキュリティヘッダの付与**と **`/api/*` の same-origin プロキシ**（バックエンド API への中継）も担います（[アーキテクチャ](#-アーキテクチャ)参照）。

現在の稼働 URL（Linux ホスト `kensan1969` / systemd 常駐 / IP は DHCP 自動割当）:

| 種別                       | URL                                    | 認証 |
| -------------------------- | -------------------------------------- | ---- |
| 🌐 インターネット公開       | `https://riskchecker.mirai-dx-platform.com/` | Cloudflare Access（ID ベース・OTP/メール） |
| LAN（自動割当 IP・現在値） | `http://192.168.0.185:8700/`           | Cloudflare Access JWT（本番設定時・外部評価 #240） |
| ローカル                   | `http://127.0.0.1:8700/`               | Cloudflare Access JWT（本番設定時・外部評価 #240） |
| ヘルスチェック             | `http://127.0.0.1:8700/healthz` → `ok` | なし（LAN/ローカルのみ。インターネット経由は Issue #94 対応まで Access 保護下） |

> **インターネット公開**（`riskchecker.mirai-dx-platform.com`）は Cloudflare Tunnel（TLS 終端）+ Cloudflare Access（ID ベース認証・Issue #70）で保護しています。本番（`OCSRC_ACCESS_TEAM_DOMAIN` / `OCSRC_ACCESS_AUD` 設定時）は `/healthz` を除き **LAN 直アクセスにも Access JWT を要求**し、未認証は 403 を返します（外部評価 #240 対応）。通常のブラウザ利用は公開 URL 経由の Access セッションに集約されます。Access 未設定の開発モードのみ、LAN 直アクセスを認証なしで許可します。公開の詳細手順・セキュリティ境界は [`docs/deploy-backend.md`](docs/deploy-backend.md) を参照。
>
> LAN の IP は DHCP 割当のため環境や再起動のタイミングで変わり得ます。固定 IP をコードや設定に書き込む必要はありません（`server.mjs` は `HOST=0.0.0.0` で全インタフェース待受のため、どの IP が割り当たっても自動的に到達可能）。現在値を確認したい場合は `scripts/install-systemd.sh` の実行結果（`LAN: http://<IP>:<PORT>/` 行）、または `hostname -I` / `ip route get 1.1.1.1` を使用してください。

### A. systemd（既定・稼働中・Linux ネイティブ）

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

> 🚀 **バックエンド API（KSJ 空間検索）も常駐させる場合**は `scripts/install-systemd-api.sh` を実行します（`ocsrc-api.service`・127.0.0.1 バインド・web へのプロキシ先自動注入）。DB（PostGIS）起動・パスワード設定を含む全体手順の正本は [`docs/deploy-backend.md`](docs/deploy-backend.md) を参照してください。

> 🌐 **インターネット公開する場合**は `scripts/install-tunnel.sh` を実行します（`ocsrc-tunnel.service` / Cloudflare Tunnel）。**公開前に Cloudflare Access アプリを作成し `/etc/ocsrc/web.env` へ設定**すること（未設定だと Tunnel 経由は 503。スクリプトが実挙動プローブで検証します）。DNS ルート作成（一般公開スイッチ）は `CREATE_DNS_ROUTE=1` を付けたときだけ実行されます。本番の 3 サービス構成:

```bash
systemctl status ocsrc-web ocsrc-api ocsrc-tunnel   # web(:8700) / api(127.0.0.1:8000) / tunnel
```

| サービス | 役割 | バインド/経路 |
| --- | --- | --- |
| `ocsrc-web` | SPA 配信 + セキュリティヘッダ + `/api` プロキシ + Cloudflare Access JWT 検証（server.mjs・Tunnel / LAN 直の両方） | `0.0.0.0:8700` |
| `ocsrc-api` | KSJ 空間検索 API（FastAPI） | `127.0.0.1:8000`（LAN 非公開） |
| `ocsrc-tunnel` | Cloudflare Tunnel（TLS 終端は Cloudflare） | アウトバウンドのみ |

### B. Docker（代替・別ホスト向け）

> 📌 現在の本番稼働は上記 A（systemd / Linux ホスト `kensan1969` / 自動割当 IP）です。本節は Windows ホスト等、systemd が使えない環境で Docker を使う場合の代替手順として保持しています。

systemd の代わりに Docker で常駐させる場合（`restart: always` で再起動後も自動起動）:

```bash
cd infra
OCSRC_PORT=8700 docker compose up -d --build
docker compose logs -f
docker compose down               # 停止
```

> systemd と Docker は同一ポートを使うため、**どちらか一方**を使用してください。

> ⚠️ **Windows ホストでの既知の落とし穴**: `restart: always` はコンテナ自身の再起動を担保しますが、
> Docker Desktop（Docker エンジン）そのものが起動していなければコンテナは復帰しません。Docker Desktop の
> 既定は「ログイン時に自動起動しない」設定のため、Windows 再起動後にサイトが接続拒否になることがあります
> （2026-07-05 に本番 `http://192.168.0.143:8700/` で実際に発生・復旧済み）。対策として、ログオン時に
> Docker Desktop を起動するタスクを登録済みです:
>
> - スクリプト: `scripts/ops/Start-DockerDesktop.ps1`
> - タスク名: `OCSRC-DockerDesktop-AutoStart`（Task Scheduler / ログオン時トリガー）
> - 確認: `Get-ScheduledTask -TaskName OCSRC-DockerDesktop-AutoStart`

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

## 📋 実装済み機能（MVP / 受入条件 AC-001〜010 対応）

| 画面                     | 内容                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCR-000 ダッシュボード   | 既定の起動画面。調査案件一覧・KPI・確認優先度の全体集計。**本番データ（実取得）案件**と**ダミー（サンプル）案件**を区別表示。JSON 取込/エクスポート対応。**案件台帳（サーバー保存）**セクション（Issue #111・API 有効時のみ表示）：一覧・**「開く」で保存済み確認結果を復元表示**・承認申請・承認・監査履歴表示・承認者表示 + **状態サマリー（draft / 承認待ち / approved の件数）**                                                                                                                                                                             |
| SCR-001 地点入力         | 住所 / 緯度経度・検索半径（100m〜3km）・確認カテゴリ選択、入力検証。**調査テンプレート（評価書 #21）**: 標準調査・道路工事・河川・護岸工事・建築・造成工事の工種別プリセットで半径・カテゴリの初期値を一括適用（適用後も個別調整可）                                                                                                                                                                                                                                                                  |
| SCR-002 リスク判定       | 地図（地理院タイル＋実ジオメトリ）、確認優先度サマリー、カテゴリ別結果一覧、結果クリア→地点入力へ戻る。**区域内判定（Issue #112）は区域名・想定水深をサマリー表示**・道路/水路/施設/駅の最寄りは**16方位＋距離**で表示（評価書 #9/#10）。**地図キャプチャ（Issue #274）**: 表示範囲を PNG 化し調査パックへ同梱（出典・取得日時・除外レイヤを明示。ハザードタイルはライセンス考慮でデフォルト除外＋明示オプトイン）                                                                                                                                                                                                                              |
| SCR-003 リスク詳細       | 根拠データ・出典・取得日時・距離・注意事項・コメント欄（右ドロワー）                                                                                                                                                                                                                                                                |
| SCR-004 AI調査メモ       | 断定表現を避けた調査メモを自動生成・編集・再生成。**AI生成（Anthropic Claude・サーバー側ブローカー経由、ブラウザに API キーを保持しない）**に対応：テンプレートを土台に生成し、禁止表現チェック + 免責文必須化を通す                                                                                                                                                   |
| SCR-005 レポート出力     | Markdown / CSV 出力（公開区分つき、UTF-8 BOM 付き CSV）+ **調査パック（Issue #113）**: A4 印刷向け HTML（出典一覧・確認チェックリスト・免責文・承認欄）をブラウザ印刷で PDF 化。**地図キャプチャ（Issue #274）同梱**: 分析画面で取得した地図画像（PNG）を「位置関係・ハザード重ね合わせ図」セクションに埋め込み、出典・取得日時・ライセンス注記を併記                                                                                                                                                                                                                                                                             |
| SCR-010 候補地比較       | 保存済み案件（実データ + **サーバー台帳案件（#111・有効時）** + ダミー）から 2〜4 地点を選択し、主要リスク要素（災害・河川・地形・気象・道路・施設）を横並び比較。**データ未取得と低リスクを区別**・断定表現なし。**候補地の位置関係マップ**（選択順の番号つきマーカー + 検索範囲円・fitBounds で全体表示）。**地図キャプチャ（#274 方式）**: 表示中のマップを画像化し A4 印刷 / PDF の「候補地の位置関係」セクションへ同梱（出典・取得日時を明示）。Markdown / CSV エクスポート対応 + **A4 印刷 / PDF（#113 調査パックと同方式）**。選択が無い場合は架空のデモ比較を表示（Issue #175）                                                                                                                                                                                                                         |
| SCR-006 データソース管理 | 接続状態・利用条件の台帳、接続テスト（実疎通）。**データ鮮度・ライセンス台帳（Issue #174）**: 行クリックで元データ更新日・利用条件メモ・再取込履歴を表示。レポートの出典セクションへ鮮度・利用条件を自動埋め込み                                                                                                                                                                                                                                                                                      |
| SCR-007 取得ログ         | 実行履歴（成功 / 失敗 / タイムアウト / スキップを区別）                                                                                                                                                                                                                                                                             |
| SCR-009 監査ログ         | 案件台帳の操作履歴（Issue #111・auditor ロール）。actor・時刻・対象・action を表示（本文・秘密情報は含まない）。API 未設定時は架空のダミー監査ログを表示。**CSV エクスポート（監査証跡・ISO/J-SOX・UTF-8 BOM 付き）** + **フィルタ・検索（actor / action / 対象 / キーワード・AND 結合・件数表示）**                                                                                                                                                                                                                                  |
| SCR-008 システム設定     | AI設定（**Anthropic（Claude）専用・サーバー側キー管理**。設定状態表示/接続テスト。ブラウザにキーを保存しない）+ **AI 利用状況（評価書 #20）**: 直近30日の呼び出し数・成功/失敗・文字数・概算費用・ユーザー別をサーバー側 DB（`ai_usage`）から集計表示+ **バックエンド接続（KSJ連携）**（既定は「このサイト経由（/api プロキシ）」・カスタム URL の保存/解除・接続テスト。ビルド不要で即時反映）+ **地点確認の既定値**（既定検索半径・既定カテゴリ）+ **アクセス権限（RBAC・Issue #111）**（案件台帳の5ロールと権限マトリクスを表示・割当はサーバー側 env）+ **ローカルデータ管理**（全削除・二段階確認）+ アプリ情報。**AI キー以外の設定はブラウザの localStorage に保存** |

### 🔌 連携している公開データソース（ブラウザ直接呼び出し）

| ソース                    | 用途                                             | 連携状態                                                      |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| OpenStreetMap / Nominatim | 住所ジオコーディング                             | ✅ 実連携                                                     |
| OpenStreetMap / Overpass  | 周辺道路・水域・施設・駅（実距離計測）           | ✅ 実連携                                                     |
| Open-Meteo                | 7日予報（強雨・強風の抽出）                      | ✅ 実連携                                                     |
| 国土地理院 地理院タイル   | 背景地図（淡色/標準/写真）・標高                 | ✅ 実連携                                                     |
| ハザードマップポータル    | 洪水浸水想定・土砂災害の重ね合わせタイル + **区域内判定（Issue #112: `/api/v1/hazard-assess`・合成サンプル検証済み・実データ調達は利用規約確認後）** | ✅ 実連携（自動判定 + タイル視覚フォールバック）             |
| 国土数値情報 (KSJ)        | 河川（ローカルDB / PostGIS 空間検索。施設 `P02` はスキーマ・取込CLI対応済みだが未投入 — 施設は Overpass が実運用でカバー）。**ハザードポリゴン（A31/A33 相当・dataset=`hazard`）** | ✅ 実連携（既定: same-origin `/api` プロキシ経由・Phase 2）   |
| 気象庁 警報・注意報       | 都道府県（気象庁発表単位）の警報・注意報発表状況 | ✅ 実連携（Phase 3・認証不要・CORS開放）                      |
| PLATEAU                   | 3D都市モデル                                     | ⏸ 未実装（実リクエストなし・疑似ログを記録しない）            |
| xROAD                     | 道路交通量                                       | ⏸ 未連携（利用規約同意が必要）                                |

> ハザードの重なり判定は **Issue #112 でサーバ側の区域内判定（ST_Contains）と最寄り距離（ST_Distance）へ昇格**しました（`/api/v1/hazard-assess`・出典・基準年つき・断定表現なし）。バックエンド未到達時は従来の**タイル目視（視覚確認要）**へフォールバックします。KSJ はバックエンド停止・DB 未整備時に「取得失敗」、PLATEAU / xROAD は「未実装・未連携（実リクエストなし）」として誠実に区別表示します（要件 FR-503 / NFR-504・外部評価 Phase 0）。
>
> **気象庁 警報・注意報連携（Phase 3・Issue #22）**: 地点の都道府県を Nominatim 逆ジオコーディングで特定し、`https://www.jma.go.jp/bosai/warning/data/warning/{都道府県コード}.json` を直接取得します（バックエンド不要）。表示文は気象庁自身が作成した `headlineText` をそのまま採用し、アプリ側で警報名を合成しません。**北海道・鹿児島県・沖縄県は地域ごとに気象台が分かれ単一コードを持たないため、人口の多い代表地域（札幌／鹿児島県本土／沖縄本島）の発表状況を表示し、その旨を確認結果の注意事項に明記**します。

---

## 🧪 品質ゲート / テスト

ローカル実行コマンド（フロントエンド `frontend/`）:

| ゲート         | コマンド             | 内容                                      |
| -------------- | -------------------- | ----------------------------------------- |
| Lint           | `npm run lint`       | ESLint（TypeScript + React Hooks ルール） |
| 型チェック     | `npm run typecheck`  | `tsc --noEmit`（テストファイル含む）      |
| ユニットテスト | `npm test`           | vitest（純粋ロジックの回帰防止）          |
| スモークテスト | `npm run test:smoke` | esbuild ランナー（環境非依存の二重検証）  |
| ビルド         | `npm run build`      | 本番ビルド成功確認                        |

ローカル実行コマンド（バックエンド `backend/`）:

| ゲート         | コマンド       | 内容                                       |
| -------------- | -------------- | ------------------------------------------ |
| Lint           | `ruff check .` | Python Lint                                |
| ユニットテスト | `pytest`       | KSJ パース・API・取込 CLI（PostGIS 統合テストは DB 到達時のみ） |

### 🎯 テスト対象（純粋ロジック）

DOM 非依存の純粋関数を中心に検証します。とくに**「断定表現を出力しない」コンプライアンス制約**（要件 §3.2）を回帰テストで保証します。

- `src/risk/memo.ts` — AI調査メモ生成（免責文の必須化・根拠データ紐付け・8セクション構成）
- `src/report/markdown.ts` — Markdown レポート（免責文・公開区分・優先度集計）
- `src/report/csv.ts` — CSV 生成（RFC 4180 エスケープ・距離丸め・出典連結）
- `src/api/geo.ts` — Haversine 距離・bbox（WGS84）
- `src/api/jmaWarning.ts` — 都道府県→気象庁コード変換、警報コード→名称、発表中警報の抽出・確認項目化
- `src/data/constants.ts` — ラベル辞書の網羅性・「該当なし／データ未取得」の区別

### 🔁 二重ランナー構成（vitest + esbuild スモーク）

テスト本体は1つ（`src/**/*.test.ts`, `import ... from 'vitest'`）で、2つのランナーから実行します。

- **vitest**（CI・通常環境）: `npm test`。
- **esbuild スモーク**（`scripts/smoke-test.mjs`）: `npm run test:smoke`。`'vitest'` を極小 shim（`scripts/smoke/shim.mjs`）に alias し、esbuild で単一バンドル化して node 上で実行します。仮想メモリ `ulimit` 制約により Vite/WASM 系ツールが起動できない環境でも、同じテスト資産をそのまま検証できます。

### ⚙️ CI（`.github/workflows/ci.yml`）

`main` への push / PR で以下の 3 ジョブを実行します。

| ジョブ       | 環境                                 | 内容                                                                     |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------ |
| 🖥 frontend  | Node 22                              | `npm ci` → lint → typecheck → vitest → smoke → build                     |
| 🐍 backend   | Python 3.12 + PostGIS サービスコンテナ | ruff → pytest（KSJ 空間検索の**実 DB 統合テスト**含む）                  |
| 🔐 security  | Node 22 / Python 3.12                | `npm audit --audit-level=high` + `pip-audit`（既知脆弱性検出で fail）    |

補助的な自動化・対策:

- 🤖 **Dependabot**（`.github/dependabot.yml`）: npm / pip / GitHub Actions の 3 エコシステムを**週次**で更新チェックし PR を自動作成
- 🛡️ Actions はコミット **SHA でピン留め**（サプライチェーン対策）、`permissions: contents: read`、`persist-credentials: false`

---

## 🏗 アーキテクチャ

### 🗺️ システム全体（現行）

本アプリは**フロントエンド中心の SPA** です。リスク判定・AI 調査メモ・レポート生成はすべてブラウザ内の TypeScript で実行し、外部公開 API はブラウザが直接 fetch します。バックエンド（FastAPI + PostGIS）は国土数値情報（KSJ）の空間検索補助に限定され、`server.mjs` の **`/api/*` same-origin プロキシ**経由で到達します（API 自体は 127.0.0.1 バインドで LAN へ直接露出しません）。

アクセス経路は 2 つあります。**① LAN 内**は `:8700` へ直接 HTTP で到達しますが、本番では Cloudflare Access JWT を要求します（外部評価 #240 対応。`/healthz` のみ例外）。**② インターネット公開**は Cloudflare Tunnel（TLS 終端）→ Cloudflare Access（エッジ認証 + origin JWT 検証・Issue #70）を通ります。DB は**ローカル PostGIS** と **Neon（マネージド PostGIS）**のどちらかを `OCSRC_DATABASE_URL` で選択します。

```mermaid
flowchart LR
    subgraph USERS["👥 利用者"]
        B["🌐 ブラウザ（SPA / React + TS）<br/>入力検証・確認優先度判定・AIメモ・<br/>レポート生成・localStorage 保存"]
    end

    subgraph EDGE["☁️ Cloudflare（インターネット公開経路）"]
        CF["Cloudflare Edge<br/>TLS 終端 + DDoS 緩和<br/>riskchecker.mirai-dx-platform.com"]
        TN["ocsrc-tunnel（cloudflared）<br/>アウトバウンド接続のみ"]
    end

    subgraph HOST["🖥️ Linux ホスト（systemd 常駐 / IP は DHCP 自動割当）"]
        W["ocsrc-web（server.mjs）<br/>0.0.0.0:8700<br/>静的配信 + セキュリティヘッダ + <br/>Tunnel 経由 Access JWT 検証・失敗レート制限"]
        A["ocsrc-api（FastAPI）<br/>127.0.0.1:8000（LAN 非公開）<br/>/livez・/readyz・/api/v1/ping・/api/v1/nearby<br/>/api/v1/ai/status・/api/v1/ai/memo"]
    end

    subgraph DB["🗄️ 空間 DB（OCSRC_DATABASE_URL でどちらか一方を選択）"]
        DS{"DB を 1 つ選択"}
        D1[("ローカル PostGIS<br/>127.0.0.1:5432<br/>開発既定")]
        D2[("Neon PostGIS 3.5<br/>マネージド・TLS 必須<br/>本番既定")]
    end

    subgraph EXT["☁️ 外部公開 API 群（ブラウザが直接 HTTPS fetch）"]
        E1["Nominatim / Overpass<br/>ジオコーディング・地物"]
        E3["Open-Meteo / 地理院<br/>気象・タイル・標高"]
        E5["ハザードマップ / 気象庁<br/>浸水想定・警報"]
        E7["Anthropic API<br/>AI 調査メモ（サーバー側ブローカー経由・任意）"]
    end

    B -->|"② HTTPS（公開・要認証）"| CF
    CF <-->|"Tunnel"| TN
    TN --> W
    B -->|"① HTTP :8700（LAN・JWT 必須・/healthz は例外）"| W
    W -->|"/api/* same-origin プロキシ<br/>（GET/HEAD のみ・Authorization 非転送）"| A
    A -->|"OCSRC_DATABASE_URL"| DS
    DS -.->|ローカル| D1
    DS -.->|本番| D2
    B -.-> E1
    B -.-> E3
    B -.-> E5
    B -.-> E7
```

| コンポーネント | 役割 | 備考 |
| -------------- | ---- | ---- |
| SPA（ブラウザ） | 取得・判定・メモ・出力のすべて | 利用者データは `localStorage` のみ（サーバ側に保存しない）。AI API キーはサーバー側のみ |
| `frontend/server.mjs`（ocsrc-web） | 静的配信 / セキュリティヘッダ / `/api/*` プロキシ / Access JWT 検証 | 依存ゼロ Node。転送先は環境変数固定（SSRF 防止）。公開時は Cloudflare Access（Issue #70） |
| `backend/`（ocsrc-api） | KSJ 空間検索 API（読み取り専用 3 エンドポイント） | 127.0.0.1 バインド。SPA は**既定で same-origin `/api` プロキシ経由**で接続（Issue #57） |
| PostGIS / Neon | KSJ 取込データの近傍検索（`ST_DWithin`） | `python -m app.ingest` で取込（冪等）。本番は Neon（マネージド）を推奨 |
| `ocsrc-tunnel`（cloudflared） | インターネット公開（TLS 終端は Cloudflare） | DNS ルート作成が公開スイッチ。作成前は Tunnel 経由到達なし |

> 📖 仕様の正本: 実装アーキテクチャの詳細は [`docs/detailed-specification.md`](docs/detailed-specification.md) §3、バックエンド中心構成（認証・案件管理）は同 §3.4 の**将来計画（Phase 4+）**として整理しています。
> 🔐 公開時のセキュリティ境界（TLS・認証・レート制限）は [`docs/deploy-backend.md`](docs/deploy-backend.md) の公開手順を正本とします。

### 📁 フロントエンド構成

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
│   ├── jmaWarning.ts   気象庁 警報・注意報（都道府県コード変換 → 発表状況の確認項目化）
│   ├── ping.ts         接続テスト
│   └── runAnalysis.ts  オーケストレーション（並行取得・部分結果・誠実な失敗表現）
├── risk/memo.ts        AI調査メモ生成（断定表現を避ける）
├── report/             Markdown / CSV レポート生成
├── map/SiteMap.tsx     Leaflet 地図（地理院/ハザードタイル + 実ジオメトリ）
│   ├── capture.ts      地図キャプチャの純粋ロジック（投影・タイル範囲・帰属文・ライセンス定数・#274）
│   └── captureMap.ts   Leaflet 表示範囲の canvas PNG 化（依存追加なし・#274）
├── components/         Header / Sidebar / Footer / LoadingOverlay / FindingDrawer
└── screens/            SCR-001〜007 各画面
```

### 📥 本番データ（調査案件）の投入

ダッシュボード（SCR-000）の調査案件は2種類を区別表示します。

- **実データ（本番）**：実際の地点確認結果を SCR-002 の「ダッシュボードに保存（本番データ）」で保存したもの。`localStorage`（キー `ocsrc-cases`）に永続化され、確認結果スナップショット（findings・出典・取得日時）ごと保存されるため「開く」で再取得せず復元表示します。`実データ` タグ付き・削除可。
- **ダミー（サンプル）**：`src/data/cases.ts` の6件（`isDummy:true`）。`ダミーデータ` タグを明記。「開く」は座標で実取得を実行します。**本番ビルドでは既定で非表示**（下記トグル）。

#### ダミーデータの表示トグル（本番非表示）

ダミー6件の表示有無はビルド時に切り替わります。

| ビルド                               | 既定の表示 | 備考                                       |
| ------------------------------------ | ---------- | ------------------------------------------ |
| `npm run dev`                        | 表示       | 開発・動作確認用                           |
| `npm run build`（本番）              | **非表示** | 実行 JS バンドルからも除去（tree-shaking） |
| `VITE_SHOW_DUMMY=true npm run build` | 表示       | デモ用に本番でもダミーを出したい場合       |
| `VITE_SHOW_DUMMY=false npm run dev`  | 非表示     | 開発中に本番相当を確認したい場合           |

> 環境変数 `VITE_SHOW_DUMMY`（`'true'`/`'false'`）が最優先。未指定時は dev=表示 / 本番=非表示。`scripts/install-systemd.sh` は `npm run build`（本番）を実行するため、**常駐サービスは既定でダミー非表示**になります。

投入経路:

1. **地点確認 → 保存**：地点確認を実行し、SCR-002 右パネルの「＋ ダッシュボードに保存（本番データ）」を押す。
2. **JSON 一括取込**：ダッシュボード右上「↑ 本番データ取込」から JSON 配列を取り込む。各要素は最低 `name` / `lat` / `lon` が必要（`radius` / `counts` / `status` 等は任意、未指定は補完）。緯度経度は WGS84 範囲で検証し、範囲外は除外します（要件 NFR-501/505）。
3. **エクスポート**：「↓ エクスポート」で実データのみ JSON 出力（バックアップ・他環境移行用、ダミーは対象外）。

> データの出所は `isDummy` フラグで常に追跡可能で、集計（KPI・優先度分布）はダミー込みの全件を対象にしつつ件数の内訳（実データ / ダミー）を併記します。

### 🧪 サーバー台帳のデモ・確認手順（Issue #111 / #174）

案件台帳（サーバー保存）・データソース台帳は **feature flag 既定 off** のため、デモ確認するには backend を有効化して seed を投入します（本番には影響しません）。

```bash
# 1) backend を案件台帳 + データソース台帳を有効化して起動
cd backend
OCSRC_CASE_STORE_ENABLED=true \
OCSRC_DATA_SOURCE_STORE_ENABLED=true \
OCSRC_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker \
OCSRC_CASE_ADMIN_USERS=admin@example.com \
OCSRC_CASE_APPROVER_USERS=approver@example.com \
OCSRC_CASE_EDITOR_USERS=editor@example.com \
OCSRC_CASE_AUDITOR_USERS=auditor@example.com \
  uvicorn app.main:app

# 2) デモ用の架空データを投入（案件3件: draft/submitted/approved + 監査ログ + データソース台帳7件）
python -m app.seed_demo_cases --with-sources --database-url "$OCSRC_DATABASE_URL"
# （--reset で削除して再投入。すべて架空値・実在情報なし）

# 3) ブラウザで確認
#  - ダッシュボード（SCR-000）: 案件台帳セクション（状態サマリー・申請/承認/履歴/開く）
#  - 監査ログ（SCR-009）: フィルタ・CSV エクスポート
#  - 候補地比較（SCR-010）: サーバー案件が「【サーバー】」ラベルで比較候補に追加
#  - データソース管理（SCR-006）: サーバー台帳 + 再取込履歴
#  - システム設定（SCR-008）: RBAC 権限マトリクス
```

> デモ用の架空値はすべて「（架空）」「デモ」と明記し、実在情報・個人情報・会社実データは含みません。seed は再生成可能で、UI・API・DB で参照整合性が保たれます。

### 🗺️ 地図キャプチャのデモ・確認手順（Issue #274）

調査パック（A4 印刷向け HTML/PDF）へ同梱する地図画像（Leaflet 表示範囲の PNG 化）の確認手順です。

```text
1) 「サンプル地点で試す（霞が関）」で地点確認を実行 → SCR-002 の地図を表示
2) 地図右上の「地図画像を取得」をクリック
   - 表示中のレイヤ（ベース・道路・水路・施設・検索範囲）が画像化され「✓ 取得済み」と表示
   - ハザードレイヤ（洪水浸水想定・土砂災害）はデフォルトで画像に含めません（保存・再配布条件が
     レイヤごとに異なるため: docs/data-license-ledger.md）。含める場合は「ハザードレイヤも含める」
     にチェックして再取得（画像・調査パックに利用条件の注意文を明記）
3) レポート出力（SCR-005）→「🖨 調査パックを開く（A4 印刷 / PDF）」
   - 「2. 位置関係・ハザード重ね合わせ図（地図キャプチャ）」に地図画像・出典・取得日時・
     除外/ライセンス注記が同梱されます
```

> タイル画像は実サーバー（地理院・ハザードマップポータル）から取得します。CORS 非対応や通信エラーで
> 取得できないタイルはプレースホルダ扱いとなり、失敗は注記に正直に記録されます（疑似成功なし）。

### 🎨 テーマ（ライト / ダーク）

ヘッダーのトグルでライト/ダークを切り替えます。構造色は CSS 変数（`src/styles.css` の `:root` / `:root[data-ocsrc-theme='dark']`）、意味色（確認優先度 A〜D・状態・案件状態）は JS のテーマ別パレット（`getPrio(theme)` 等）で解決します。選択は `localStorage` に保存され、`data-ocsrc-theme` 属性で適用されます。

地図のダーク化はペイン単位で制御します（Issue #58-3）:

| Leaflet ペイン | 対象タイル | ダーク時の扱い |
| --- | --- | --- |
| 既定 `tilePane` | ベース地図（淡色/標準/写真）・陰影起伏 | `filter: invert(...)` で反転しダーク地図化 |
| 専用 `ocsrc-hazard`（z-index 250） | 洪水浸水想定・土砂災害 | **反転しない** — 凡例と色の意味を両テーマで一致させる |

### 📱 レスポンシブ対応（Issue #58-1）

シェルとカラム型画面は画面幅に応じて段階的にレイアウトが変わります（`src/styles.css` の `ocsrc-*` クラス + メディアクエリ）。

| 幅 | レイアウト |
| --- | --- |
| 🖥 1024px 以上 | デスクトップ（従来レイアウト） |
| 📱 1023px 以下（タブレット） | ヘッダー地点チップ縮小・ダッシュボード KPI 4→2 カラム |
| 📱 767px 以下（モバイル） | サイドバー→上部横スクロールタブ、リスク判定 3 カラム→縦積み（地図 320px 確保）、レポート縦積み、リスク詳細ドロワー全幅化、ヘッダー/フッターの補助情報を非表示 |

> 実装規約: メディアクエリで変えるプロパティは inline style に残さず `ocsrc-*` クラスへ移す（inline はメディアクエリで上書きできないため。`styles.css` のコメント参照）。取得ログ・データソース等のテーブル型 grid のモバイル最適化は今後の課題（Issue #58）。

### 💡 設計上の重要方針

1. **断定しない**：「安全 / 危険 / 施工可否 / リスクなし」を使わず、「要確認 / 追加確認推奨 / 参考情報 / データ不足」で表現する（要件 §3.2）。
2. **アダプタ方式**：データソースは `src/api/` のアダプタに分離し、追加・差し替えを容易にする（要件 NFR-401/402）。将来のバックエンド（FastAPI）へ移設しやすい契約（`AdapterResult`）を採用。
3. **出典と取得日時の明示**：すべての確認項目に根拠データ・出典・取得日時・注意事項を紐付ける（要件 NFR-301）。
4. **「該当なし」と「取得失敗」の分離**：データ整備範囲内の「該当なし」と、API 失敗・未連携を必ず区別する（要件 FR-304 / NFR-504）。
5. **一時的障害への限定リトライ（評価書 #14）**：読み取り専用アダプタ（ジオコーディング・Overpass・気象・標高・KSJ・ハザード判定）は 5xx/タイムアウト/ネットワークエラー時に**1回だけ再試行**する（`fetchJson` の `maxRetries`・既定 0）。**ミューテーション（AI 生成・案件作成/承認等）は再試行しない**（二重実行・二重課金防止）。取得ログには累積応答時間と「1回リトライ後成功/（1回リトライ後）」を明記し、再試行を隠さない。

---

## 🐍 バックエンド（KSJ 空間検索・Phase 2 稼働中）

`backend/` の FastAPI バックエンドは、国土数値情報（KSJ）のローカル DB 化（PostgreSQL + PostGIS）と空間検索 API を提供します。主なエンドポイントは **liveness `/livez`・readiness `/readyz`（DB 異常時 503）**、`/api/v1/ping`、`/api/v1/nearby`、**ハザード区域判定 `/api/v1/hazard-assess`（Issue #112）**、**データソース台帳 `/api/v1/data-sources`（Issue #174・feature flag `OCSRC_DATA_SOURCE_STORE_ENABLED` 有効時のみ）**、AI ブローカー（`/api/v1/ai/status`・`/api/v1/ai/memo`）、**案件台帳（Issue #111: `/api/v1/cases*`・`/api/v1/audit`、feature flag `OCSRC_CASE_STORE_ENABLED` 有効時のみ）**です。

開発時（Docker で DB + backend を起動）:

```bash
cd infra
cp .env.example .env                          # DB パスワード等（コミット禁止・本番は強パスワード必須）
docker compose --profile phase2 up -d --build # db(PostGIS) + backend を起動
curl http://127.0.0.1:8000/livez              # → {"status":"ok","version":"0.2.0",...}
curl http://127.0.0.1:8000/readyz             # → {"status":"ok","db":"ok",...}（DB 異常時は 503）
```

- 既定の `docker compose up`（フロント配信のみ）には**影響しません**（profile 分離）
- 🚀 **本番デプロイ（systemd）**: `scripts/install-systemd-api.sh` で `ocsrc-api.service` を常駐化します（venv 自動構築・**127.0.0.1 バインド**・`ocsrc-web` へのプロキシ先自動注入・DB 資格情報は `/etc/ocsrc/api.env` で管理）。手順の正本は [`docs/deploy-backend.md`](docs/deploy-backend.md)
- 🗺️ **KSJ 空間検索（Phase 2-3/2-4 実装済み）**: `python -m app.ingest` で国土数値情報（GeoJSON）を PostGIS へ取込み、`GET /api/v1/nearby?lat=&lon=&radius_m=` で近傍の河川・施設を距離つきで返します（取込手順は [`backend/data/README.md`](backend/data/README.md)）。**実データでの動作検証済み**: NII Geoshape 経由で荒川水系（日本橋川・隅田川等 2,937件、CC BY 4.0）を取込み、霞が関周辺の検索で実取得できることを確認
- 🏞️ **ハザード区域判定（Issue #112・Phase 1 実装済み）**: `GET /api/v1/hazard-assess?lat=&lon=&radius_m=` で浸水想定（A31）・土砂災害警戒（A33）相当のポリゴン（dataset=`hazard`）に対して `ST_Contains` の区域内判定と `ST_Distance` の最寄り距離を返します。フロントはタイル目視から**区域内/外 + 距離 + 出典・基準年**の自動判定表示へ昇格（API 未到達時は従来の視覚確認へフォールバック）。テスト・開発用の合成サンプルは `backend/data/sample/sample-hazards.geojson`（実データ調達は A31/A33 の利用規約確認後に実施）
- 🔌 **バックエンド接続先は既定で「このサイト経由（same-origin `/api` プロキシ）」です（Issue #57）**: 追加設定なしで、LAN 上の別端末のブラウザからも配信オリジン（`:8700`）の `/api/*` 経由で 127.0.0.1 バインドの API へ到達します。優先順位は ① **SCR-008 のカスタム URL**（localStorage 保存・ビルド不要で即時反映） > ② ビルド時 `VITE_OCSRC_BACKEND_URL`（例 `http://127.0.0.1:8000`） > ③ **未設定 = same-origin 既定（相対 `/api`）**。バックエンド停止・DB 未整備時は「取得失敗」として誠実に表示します（「該当なし」と区別・NFR-504）。SCR-008 の接続テストは、既定時はプロキシ特例の `/api/readyz`、カスタム URL 設定時は `{URL}/readyz` で DB 到達性まで確認します
- 詳細は [`backend/README.md`](backend/README.md) を参照

---

## 🔐 セキュリティと運用境界

### 🛡️ 実装済みのセキュリティ対策

| 対策 | 実装 | 内容 |
| ---- | ---- | ---- |
| セキュリティヘッダ | `frontend/server.mjs` | 全レスポンスに **CSP**（外部オリジン許可リスト方式）・`X-Content-Type-Options: nosniff`・`X-Frame-Options: DENY`・`Referrer-Policy` を付与 |
| same-origin プロキシ | `frontend/server.mjs` | `/api/*` を環境変数固定の転送先（`OCSRC_BACKEND_ORIGIN`）へ中継（**SSRF 防止**）。GET/HEAD のみ・パス正規化後の `/api` 配下再検証 |
| API の非公開バインド | `scripts/install-systemd-api.sh` | FastAPI は **127.0.0.1 バインド**で LAN へ直接露出しない（多層防御） |
| CORS 方針 | `backend/app/main.py` | **既定で CORS 無効**。`OCSRC_CORS_ORIGINS` の明示 allowlist のみ（開発用オプトイン）。ワイルドカードは起動時拒否・GET のみ・credentials なし |
| 秘密情報の分離 | `/etc/ocsrc/api.env`（600） / `infra/.env` | DB 資格情報はリポジトリ外で管理（コミット禁止） |
| CI 依存スキャン | `.github/workflows/ci.yml` | `npm audit --audit-level=high` + `pip-audit`（既知脆弱性で fail） |
| Dependabot | `.github/dependabot.yml` | npm / pip / GitHub Actions を週次で更新チェック |
| パストラバーサル対策 | `frontend/server.mjs` | 配信パスの正規化 + realpath 検証（シンボリックリンク脱出も遮断） |

### 🚧 運用境界（この前提の範囲内で運用する）

| 設計判断 | 内容 |
| -------- | ---- |
| 🔓 **LAN 直アクセスも Access JWT 必須（本番設定時・外部評価 #240 対応）** | バックエンド API が扱うのは**国土交通省の公共オープンデータのみ**（個人情報なし・GET のみ・データ変更手段なし）ですが、本番（`OCSRC_ACCESS_TEAM_DOMAIN` / `OCSRC_ACCESS_AUD` 設定時）は `/healthz` を除く全経路で Access JWT を検証します（403）。開発モード（Access 未設定）のみ認証なしで直接アクセスできます |
| 🌐 **インターネット公開は Cloudflare Tunnel + Access（導入済み・稼働中）** | `https://riskchecker.mirai-dx-platform.com/` として一般公開中です。Cloudflare Edge で **TLS 終端 + Access 認証（ID ベース）+ レート制限**を行い、origin（`server.mjs`）側でも JWT を多層検証します。手順・現状の稼働状況は [`docs/deploy-backend.md`](docs/deploy-backend.md#-インターネット公開cloudflare-tunnel--cloudflare-access) を参照 |
| 🔑 **本番 DB** | ローカル PostGIS の場合は `infra/.env.example` の `dev_only_password`（**開発専用**）から `OCSRC_DB_PASSWORD` 強パスワードへ **override 必須**。本番は **Neon（マネージド PostGIS）** に切替済み（構成・監視は [`docs/neon-database.md`](docs/neon-database.md)、切替手順は [`docs/deploy-backend.md`](docs/deploy-backend.md)） |

> ⚠️ **アプリケーション内の認証・アクセス権限・サーバ側操作ログ**（要件 NFR-201/203/204/205・権限ロール）: 2026-08-14 時点で **案件台帳 API（Issue #111）に RBAC（viewer/editor/approver/admin/auditor）と監査ログを実装済み**です。ただし**既定は feature flag `OCSRC_CASE_STORE_ENABLED=false` で無効**（本番は未有効のまま・preview/dev で検証後に有効化）。上記の Cloudflare Access は「インターネットから誰が到達できるか」という**境界の認証**であり、アプリケーション内のロール割当（`OCSRC_CASE_*_USERS` 環境変数）とは別物です。案件データを本番でサーバー保存する際は、ロール割当の運用と監査ログの保全方針を定めてから有効化してください（[`docs/requirements.md`](docs/requirements.md) §11.3.1 / [`docs/detailed-specification.md`](docs/detailed-specification.md) §15.4）。

---

## 📊 外部評価・改善台帳（2026-08-12）

- 改善前評価（18 項目採点・強み/弱み・競合比較・代替率）: [docs/evaluation/2026-08-12-baseline.md](docs/evaluation/2026-08-12-baseline.md)
- 改善台帳・検証証跡・再評価・ロードマップ: [docs/evaluation/2026-08-12-improvements.md](docs/evaluation/2026-08-12-improvements.md)

## 🔭 今後の拡張（要件 §18 / 詳細仕様準拠）

| フェーズ | 状況 | 内容                                                                                                                                  |
| -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2  | ✅ KSJ 実装済み | 国土数値情報のローカルDB化（PostgreSQL + PostGIS）+ FastAPI 空間検索 API（稼働中）。**ハザード区域判定（Issue #112・A31/A33 相当・合成サンプルで動作検証済み）**。**データ鮮度・ライセンス台帳（Issue #174・台帳 UI + レポート自動埋め込み + サーバ側永続化 `data_sources`/`data_source_refreshes`・feature flag 有効時のみ）**。実データ調達は利用規約確認後に実施 |
| Phase 3  | ✅ 一部実装 | 気象庁 警報・注意報連携（実装済み・Issue #22）。xROAD は利用規約上の理由（匿名アクセス 403）、PLATEAU は試験運用・SLA無しのため見送り |
| Phase 4  | 🚧 一部実装（flag 無効でデフォルト稼働） | 複数候補地比較・案件管理・社内レビュー機能。**案件台帳 API + RBAC + 監査ログ + 承認WF（Issue #111）、候補地比較ビュー（Issue #175・A4印刷対応）、調査パック（Issue #113・A4 印刷向け HTML/PDF）、監査ログのフィルタ/CSV エクスポート、RBAC 権限マトリクス可視化、地図キャプチャ（Issue #274・依存追加なしの canvas 自前実装・ハザードタイルはライセンス考慮のオプトイン制）を実装済み**。案件台帳は本番 `OCSRC_CASE_STORE_ENABLED=false` のまま（preview/dev 検証後に有効化判断） |
| Phase 5  | ⏳ 未着手 | Civil Open Data Intelligence Platform への統合                                                                                        |

詳細は `docs/requirements.md` / `docs/detailed-specification.md` を参照。

---

## 📜 出典・ライセンス表記

- © OpenStreetMap contributors（ODbL）/ Nominatim・Overpass
- Open-Meteo（CC BY 4.0）
- 国土地理院 地理院タイル（出典明示・タイル種別ごとの利用条件に従う）
- ハザードマップポータルサイト（出典明示）
- 気象庁 警報・注意報（出典明示）

各データソースの利用ポリシー（Nominatim の利用制限等）を遵守してください。

> 地図キャプチャ（Issue #274）で画像化する際は、タイルの保存・再配布に関する利用条件を
> [`docs/data-license-ledger.md`](docs/data-license-ledger.md) でレイヤごとに確認してください
> （ハザードタイルはデフォルトで画像除外・明示オプトイン制）。画像・調査パックには出典・取得日時を明示します。

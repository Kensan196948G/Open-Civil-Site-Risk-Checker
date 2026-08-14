# 改善台帳・検証証跡・再評価（2026-08-12）

> 追記（2026-08-14）: 依存更新PR整理と **Issue #111 案件台帳（サーバ側永続化・RBAC・監査ログ・承認WF）の垂直スライス**を実装。詳細は §8 に追記。
> 追記（2026-08-14・第2弾）: **監査ログ閲覧画面（SCR-009）・案件別監査履歴・デモ seed CLI・ADR-001** を実装。詳細は §9 に追記。

## 1. 実装済み改善

### 1.1 本セッション（ブランチ `feat/eval-2026-08-12-ai-audit-a11y`）

| # | 改善 | 変更ファイル | 根拠・効果 |
|---|---|---|---|
| 1 | AI ブローカーのサーバー側システムプロンプト | `backend/app/ai.py` | 直接 API 呼び出しでも出力制約（断定禁止・根拠保持・免責文）を強制 |
| 2 | AI 出力のサーバー側検証（禁止表現→`warnings`・免責文必須化） | `backend/app/ai.py` | フロント非経由の呼び出しにも防御 |
| 3 | AI 利用の構造化監査ログ（`ai_audit`・ユーザー/文字数/モデル/状態/所要時間・本文非記録） | `backend/app/main.py` | 費用発生 API の利用証跡・乱用検知 |
| 4 | 監査用ユーザー識別子の伝搬（web 層で Access JWT 検証→`X-OCSRC-User` 内部ヘッダ・クライアント直送は除去） | `frontend/server.mjs` | なりすまし不可の利用者特定（監査・将来 RBAC の前提） |
| 5 | フロントがサーバー側 `warnings` を併合表示 | `frontend/src/risk/aiMemo.ts` | 二重防御の可視化 |
| 6 | アクセシビリティ: スキップリンク・`main` ランドマーク・`aria-pressed`・エラー `role=alert`・テーマボタン `aria-label` | `App.tsx` `InputScreen.tsx` `Header.tsx` `styles.css` | キーボード/スクリーンリーダー対応 |
| 7 | backend README に AI ブローカー API・設定・監査仕様を追記 | `backend/README.md` | 文書欠落の解消 |
| 8 | 評価書・改善台帳の新設 | `docs/evaluation/*` | 再現可能な評価証跡 |

### 1.2 並行実施（SubAgent が作成・CI/検証済み・要ユーザー承認）

| # | 改善 | PR/ブランチ | 状態 |
|---|---|---|---|
| 9 | nanoid 3.3.18 更新で npm audit high 解消＋LAN 認証実態へ文書同期 | PR #258 / `fix/ci-security-nanoid-lockfile-doc-sync`（Draft） | CI 3 ジョブ green・CodeRabbit skipped（Draft） |
| 10 | Neon cold start の一時 503 で watchdog が誤起票しないよう緩和（#238） | PR #259 / `fix/db-coldstart-watchdog-238`（Draft） | CI 3 ジョブ green（nanoid 修正も同一ブランチへ反映） |
| 11 | 本評価対応: AI 監査・サーバー側制約・a11y・評価書 | PR #260 / `feat/eval-2026-08-12-ai-audit-a11y`（Draft） | CI 3 ジョブ green |
| 12 | ai_audit ログのハンドラ付与（本番スモークで検出した破棄問題の修正） | PR #261 / `fix/ai-audit-logging-260` | CI 3 ジョブ green |

## 2. 検証証跡（2026-08-12 実測）

| 検証 | 結果 | 備考 |
|---|---:|---|
| backend ruff | PASS | `/tmp/ocsrc-verify` 環境 |
| backend pytest | 51 passed / 4 skipped | 新規 6 件（AI 監査・システムプロンプト・warnings・免責文）追加。DB 統合 4 件は CI の PostGIS で実行 |
| frontend lint | PASS | eslint 10 |
| frontend typecheck | PASS | tsc --noEmit |
| frontend vitest | 82 passed | Docker node:22-slim で実行（ホストは仮想メモリ制約で wasm 確保不能・CI と同じ Node 22 で再現） |
| frontend smoke | 80/80 | esbuild shim ランナー |
| frontend server integration | 96/96 | 新規 3 件（X-OCSRC-User 伝搬・なりすまし除去・dev モード非付与） |
| frontend build | PASS | vite 8.1.5・gzip 142 KB |
| npm audit | 1 high（nanoid） | PR #258 で解消済み（main は未マージのため残） |
| pip-audit | 0 vulnerabilities | requirements.txt / requirements-dev.txt |
| CI（main 最新） | success | 2026-08-05 実行 |
| PR #258 / #259 / #260 CI | 各 3 ジョブ success | frontend/backend/security・2026-08-12 |
| PR #261 CI | 3 ジョブ success | 2026-08-12 |
| secret スキャン | 実値なし | テスト fixture のみ（`sk-ant-test` 等） |
| 本番実挙動（マージ後・再起動後） | LAN 直 403 / 公開 URL 302 / healthz 200 / readyz db ok / AI 200（warnings:[]・免責文あり） | 2026-08-12 21:28 JST |
| 本番監査ログ | `ai_audit` が journal に出力（user/prompt_chars/model/status/duration_ms/warnings・本文非記録） | 2026-08-12 21:28:51 JST |

## 3. 改善後スコア（同一基準・暫定）

| 項目 | 改善前 | 改善後 | 主な増分 |
|---|---:|---:|---|
| セキュリティ | 72 | 76 | AI 利用者監査・識別子偽装防止（本セッション） |
| 監視・障害対応 | 62 | 65 | #238 誤報緩和（PR #259） |
| テスト | 78 | 80 | 新規 9 件・server 96 |
| アクセシビリティ | 70 | 74 | スキップリンク・ARIA 補強 |
| AI 有効性 | 62 | 65 | サーバー側制約・出力検証・監査 |
| 文書 | 82 | 84 | 評価書・backend README・台帳 |
| 機能完成度 | 55 | 56 | AI 防御層（目に見える機能増ではない） |
| 競合代替性 | 55 | 56 | 監査・AI 堅牢化 |
| **加重代替率** | **62%** | **70%** | セキュリティ/監査 78 等 |

## 4. 残課題・残存リスク

| # | 課題 | 重要度 | 対応 |
|---|---:|---|
| 1 | 案件台帳のサーバ永続化・RBAC・監査 DB 化 | 重大 | Phase 1（Issue #111） |
| 2 | ハザードポリゴン自動判定 | 重大 | Phase 1（Issue #112） |
| 3 | IdP 接続（Entra ID 等）と #240 正式クローズ | 重大 | ユーザー判断（Cloudflare/Entra 権限） |
| 4 | バックアップ復元演習・外部退避 | 高 | 人間実施（docs/backup-restore.md） |
| 5 | Cloudflare Alerting・`/healthz` bypass（#94） | 高 | ユーザー判断（Cloudflare 権限） |
| 6 | KSJ 全国カバレッジ・鮮度監視 | 高 | Phase 1〜2 |
| 7 | PDF/Excel・比較ビュー・PLATEAU/xROAD | 中 | Phase 2〜3 |
| 8 | AI の RAG・責任分界・入出力監査永続化 | 中 | Phase 3 |
| 9 | 依存更新 PR 7 件の CI 失敗 | 低 | 個別対応（TS7 は typescript-eslint 待ち） |
| 10 | GitHub Projects 未接続（トークンスコープ不足） | 低 | ユーザーでトークン設定 |

## 5. ロードマップ

- **Phase 0: 重大問題・セキュリティ**（本セッション相当＋承認待ち）: AI 監査・nanoid・watchdog・復元演習・IdP・Alerting
- **Phase 1: 中核業務完成**: 案件台帳＋RBAC＋監査 DB 化・ハザード自動判定・PDF 調査パック・KSJ 全国化
- **Phase 2: 競合 80% 代替**: 比較ビュー・鮮度台帳・PLATEAU/xROAD・都市計画レイヤ・外部 API・デプロイ自動化
- **Phase 3: AI・モバイル・外部連携**: RAG/引用・通知・PWA/オフライン・監査 UI・予算ダッシュボード
- **Phase 4: 90% 代替・本番最適化**: 第三者 API/スコア・多テナント・協力会社ポータル・多言語

## 6. 投資判断

**条件付き継続**。本番初期調査ツールとしての価値と運用コストのバランスは良好。600 名組織での本番導入を進めるためには、Phase 0 の承認待ち項目（IdP・Alerting・復元演習）と Phase 1 の台帳/RBAC/監査・ハザード判定を最優先で実施する。AI への追加投資は RAG 化・費用可視化・誤判定責任の整理後に限定する。

## 7. 次に着手すべき作業（具体的）

1. PR #258・#259 のレビューとマージ判定（Y/N）
2. Issue #111 の設計（テーブル `cases` / `audit_log`・API・管理画面）と Approval PR 化
3. Issue #112 のデータ調達（国交省ハザードデータ利用規約確認）と PostGIS 判定実装
4. バックアップ復元演習の実施記録（`docs/backup-restore.md`）
5. Cloudflare ダッシュボードでの `/healthz` bypass・Alerting・Entra ID 接続（ユーザー操作）
6. 依存更新 PR の整理（マージ可否の判定または close）

## 8. 追記（2026-08-14）: 依存更新整理 + Issue #111 案件台帳 垂直スライス

### 8.1 依存更新 PR の整理（完了）

前回の残課題「依存更新 PR 7 件の整理」を完了。nanoid 修正（PR #258）より前の stale branch だった PR #249-254 を main と同期（uvicorn/fastapi の requirements.txt、typescript-eslint/vite/globals/@types/leaflet の lockfile 競合は両変更を保持して解決）し、CI 3 ジョブ green を確認してマージ。

| PR | 内容 | 結果 |
|---|---|---|
| #197 | fastapi >=0.141.1 | merged |
| #249 | uvicorn >=0.52.1 | merged（競合解決） |
| #250 | typescript-eslint 8.66.0 | merged |
| #251 | ruff >=0.16.1 | merged |
| #252 | vite 8.2.0 | merged（lockfile 競合解決） |
| #253 | globals 17.9.0 | merged |
| #254 | @types/leaflet 1.9.22 | merged |
| #73 | typescript 7.0.2 | **保留**（Issue #62: typescript-eslint の TS7 非対応待ち） |

### 8.2 Issue #111 案件台帳（サーバ側永続化・RBAC・監査ログ・承認WF）実装

外部評価の最重要推奨（案件台帳 + 監査ログ + 承認付きレポート）の**バックエンド垂直スライス**を実装。本番無影響（feature flag 既定 off）で、preview/dev で実動作を検証できる。

- **DB（additive migration）**: `cases` / `audit_log` テーブルを `CREATE TABLE IF NOT EXISTS` で冪等作成（既存 `ksj_features` に非干渉）。
- **API**: `GET/POST /api/v1/cases`、`GET/PATCH/DELETE /api/v1/cases/{id}`、`POST .../submit`・`.../approve`、`GET /api/v1/audit`。
- **RBAC**: `viewer / editor / approver / admin / auditor` の5ロール。ロール割当はサーバー側環境変数（`OCSRC_CASE_*_USERS`）で管理。actor は web 層が Access JWT 検証後に付与する `X-OCSRC-User`（クライアント直送は server.mjs で除去済み・偽装不可）。
- **承認WF**: `draft → submitted → approved`。approved 案件の更新は admin のみ。
- **監査ログ**: `case_created / case_submitted / case_approved / case_updated / case_deleted` を追記（actor・時刻・対象・action。本文・秘密情報は記録しない）。
- **feature flag**: `OCSRC_CASE_STORE_ENABLED`（既定 false）。無効時は全案件 API が 503（依存解決で body 検証より先に判定）。本番は未有効のまま。
- **web 層（server.mjs）**: `/api/v1/cases*`・`/api/v1/audit` の POST/PATCH/DELETE をプロキシ許可（flag 無効時は backend が 503 を返すため本番動作は不変）。X-OCSRC-User は既存の付与経路を利用。
- **フロントエンド**: 案件保存をサーバー優先（`/api/v1/cases` 成功時）・localStorage フォールバックに昇格。ダッシュボードに「案件台帳（サーバー保存）」セクション（一覧・申請・承認ボタン・承認者表示）を追加（API 有効時のみ表示）。

### 8.3 検証証跡（2026-08-14 実測）

| 検証 | 結果 | 備考 |
|---|---:|---|
| backend ruff | PASS | app/ tests/ 全ファイル |
| backend pytest | **79 passed** | 新規22件: RBAC 境界10 + DB 統合12（CRUD・承認WF・監査・403/409/404） |
| backend DB 統合 | PASS | CI 同一 PostGIS 16-3.4 一時コンテナ（127.0.0.1:15440）で実行 |
| frontend typecheck / lint | PASS | tsc --noEmit / eslint |
| frontend vitest | **92 passed** | 新規10件（案件 API クライアント） |
| frontend server integration | **103 passed** | 新規8件（案件 POST/PATCH/DELETE/submit/audit 中継・非案件 405） |
| frontend smoke | 80/80 | esbuild shim ランナー |
| frontend build | PASS | vite 8.2.0・gzip 143.65 KB |
| 実 API 動作（curl） | PASS | viewer 403 / editor 201 / submit→approve→approved / 監査ログ / flag off 503 |
| 本番影響 | なし | feature flag 既定 off・本番設定未変更 |

### 8.4 残課題（引き続き）

1. 案件台帳の**本番有効化判断**（ロール割当運用・監査ログ保全方針を定めてから `OCSRC_CASE_STORE_ENABLED=true`）
2. Issue #112 ハザードポリゴン判定（データ調達・利用規約確認）
3. 管理画面（監査ログ閲覧 UI・ロール管理 UI）
4. バックアップ復元演習・Cloudflare 側項目（IdP・Alerting・/healthz bypass）はユーザー判断

## 9. 追記（2026-08-14・第2弾）: 監査ログ閲覧 UI・デモ seed・ADR

Issue #111 の完了条件残り（監査ログ閲覧・案件詳細の監査履歴・ADR）と、goal の「ダミーデータ投入・保持」要件を充足。

### 9.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | **監査ログ閲覧画面（SCR-009）** | `frontend/src/screens/AuditScreen.tsx` | auditor ロール向けに `/api/v1/audit` を表示。API 未設定・未到達・権限不足時は**架空のダミー監査ログ**を表示（空画面を残さない） |
| 2 | **案件別監査履歴** | `frontend/src/screens/DashboardScreen.tsx` | 台帳セクションの各案件に「履歴」ボタン → entity フィルタで監査エントリを表示 |
| 3 | **デモ seed CLI** | `backend/app/seed_demo_cases.py` | 架空のデモ案件3件（draft/submitted/approved の各状態）+ 監査ログを投入。冪等・`--reset` で再投入。MVP 確認環境で直ちに操作可能 |
| 4 | **ADR-001** | `docs/adr/ADR-001-case-registry-rbac-audit.md` | スキーマ設計・RBAC・承認WF・feature flag の決定と代替案・受入条件を記録 |

### 9.2 検証証跡（2026-08-14 実測・第2弾）

| 検証 | 結果 | 備考 |
|---|---:|---|
| backend pytest | **82 passed** | 新規3件（seed: 冪等・リセット・架空性） |
| backend ruff | PASS | |
| frontend vitest | **97 passed** | 新規5件（監査表示ロジック） |
| frontend typecheck / lint / build | PASS | lint warning 0（定数を別ファイルへ分離） |
| 実 API 動作（curl） | PASS | seed → 一覧に3件・103 が approved・監査ログに case_approved |
| 本番影響 | なし | flag 既定 off・本番設定未変更 |

### 9.3 残課題（更新）

1. 案件台帳の**本番有効化判断**（ロール割当運用・監査ログ保全方針）
2. Issue #112 ハザードポリゴン判定（データ調達・利用規約確認）
3. ロール管理 UI（現在は env 割当）
4. バックアップ復元演習・Cloudflare 側項目（IdP・Alerting・/healthz bypass）はユーザー判断

## 10. 追記（2026-08-14・第3弾）: PostGIS ハザード区域判定（Issue #112）

外部評価で「重大」とされた残り1件（ハザード自動判定）の**垂直スライス**を実装。

### 10.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | KSJ パイプラインに `hazard` データセット追加（A31/A33 相当） | `backend/app/ksj.py` | 浸水想定・土砂災害警戒ポリゴンの取込に対応 |
| 2 | 判定 API `GET /api/v1/hazard-assess` | `backend/app/main.py`・`ksj.py` | `ST_Contains` 区域内判定 + `ST_Distance` 最寄り距離を根拠つきで返す。データ欠落地域は空リスト（該当なし）・DB 未到達は 503 |
| 3 | 合成サンプルデータ | `backend/data/sample/sample-hazards.geojson` | 霞が関周辺に架空の浸水想定・土砂災害警戒ポリゴン3件 |
| 4 | フロント自動判定へ昇格 | `frontend/src/api/hazard.ts`・`runAnalysis.ts` | タイル目視 → 区域内/外 + 距離 + 出典・基準年の自動判定表示。API 未到達時は従来の視覚確認へフォールバック（失敗を成功扱いにしない） |

### 10.2 検証証跡（2026-08-14 実測・第3弾）

| 検証 | 結果 | 備考 |
|---|---:|---|
| backend pytest | **89 passed** | 新規7件（ユニット2: 種別判定 + 統合5: 区域内/区域外/境界直上/データ欠落/性能） |
| frontend vitest | **102 passed** | 新規5件（hazard アダプタ: 断定表現なし・根拠保持） |
| frontend smoke / server | 90/90 / 103 | |
| 実 API 動作（curl） | PASS | 霞が関=区域内（土砂災害）・区域外=距離つき・太平洋上=空リスト・応答 <2s |
| 本番影響 | なし | 新規 GET エンドポイントのみ追加・既存動作不変 |

### 10.3 残課題（更新）

1. **A31/A33 実データの調達**（国交省ハザードデータ利用規約確認・NII Geoshape 等の入手経路調査）と全国カバレッジ投入
2. 案件台帳の**本番有効化判断**（ロール割当運用・監査ログ保全方針）
3. ロール管理 UI
4. バックアップ復元演習・Cloudflare 側項目（IdP・Alerting・/healthz bypass）はユーザー判断

## 11. 追記（2026-08-14・第4弾）: 候補地比較ビュー（Issue #175）

外部評価のおすすめ機能追加（2026-07-31）6「候補地比較」を実装。

### 11.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | 比較ロジック（純粋関数） | `frontend/src/report/compare.ts` | 案件→比較行の正規化・カテゴリ集約（未取得と低リスクの区別）・Markdown/CSV 生成 |
| 2 | 比較画面 SCR-010 | `frontend/src/screens/CompareScreen.tsx` | 保存済み案件から 2〜4 地点を選択し横並び比較。選択なし時はデモ比較を表示（空画面を残さない） |
| 3 | デモ比較データ | `frontend/src/data/fixtures.ts` | 架空3地点（霞が関・豊洲・八王子のデモ候補地）を findings 付きで定義 |

### 11.2 検証証跡（2026-08-14 実測・第4弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **109 passed**（新規7件: 比較正規化・未取得区別・MD/CSV 生成・断定表現なし） |
| frontend smoke / server | 97/97 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | 3地点比較・カテゴリ別セル（found/not_found）・優先度A 集計・MD に未取得区別 |

### 11.3 残課題（更新）

1. A31/A33 実データ調達（#112 の実データ投入）
2. 案件台帳の本番有効化判断（ユーザー判断）
3. ロール管理 UI
4. PDF 調査パック（#113）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 12. 追記（2026-08-14・第5弾）: データ鮮度・ライセンス台帳（Issue #174）

外部評価のおすすめ機能追加（2026-07-31）5「データ鮮度・ライセンス台帳」のフロントエンド垂直スライスを実装。

### 12.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | 台帳型の拡張（鮮度・利用条件・履歴） | `frontend/src/types.ts`・`data/sources.ts` | 全ソースに元データ更新日・利用条件メモ・再取込履歴（デモ用の架空値）を登録 |
| 2 | 管理画面の詳細表示 | `frontend/src/screens/SourcesScreen.tsx` | 行クリック（Enter/Space 対応・a11y）で元データ更新日・利用条件・再取込履歴を展開表示 |
| 3 | レポートへの自動埋め込み | `frontend/src/report/markdown.ts` | 出典セクションに「元データ更新: …」「利用条件: …」を自動追記（#113 調査パックの出典一覧の一次情報化） |

### 12.2 検証証跡（2026-08-14 実測・第5弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **113 passed**（新規4件: 台帳完全性・clone 非破壊・MD 埋め込み・未設定時省略） |
| frontend smoke / server | 101/101 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | 出典9行・KSJ 鮮度（W05: 2021年度）・利用条件の埋め込み確認 |

### 12.3 残課題（更新）

1. **サーバ側永続化（Neon テーブル）**: #111 と同じ基盤で `data_sources` / `data_source_refreshes` テーブル + API を追加（本ラウンドはフロント台帳のみ）
2. A31/A33 実データ調達（#112）
3. 案件台帳の本番有効化判断（ユーザー判断）
4. PDF 調査パック（#113）・ロール管理 UI
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 13. 追記（2026-08-14・第6弾）: 調査パック出力（Issue #113）

外部評価（2026-07-24）の「三つ目」推奨（PDF・出典一覧・チェックリスト・承認欄の一括生成）を実装。

### 13.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | A4 印刷向け HTML 調査パック生成 | `frontend/src/report/pack.ts` | 調査条件・優先度サマリー・カテゴリ別結果・出典一覧（#174 連携で鮮度/利用条件も）・確認チェックリスト・免責文・承認欄を自己完結 HTML で生成 |
| 2 | ブラウザ印刷（PDF 化） | `report/pack.ts` の `openPackForPrint` | 新ウィンドウで開き `window.print()` を呼び、A4 PDF 保存に対応（軽量案・依存追加なし） |
| 3 | レポート画面への導線 | `screens/ReportScreen.tsx` | 「調査パックを開く（A4 印刷 / PDF）」ボタンを追加 |

### 13.2 検証証跡（2026-08-14 実測・第6弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **120 passed**（新規7件: HTML セクション・出典/鮮度・免責文・承認欄・断定表現なし・XSS エスケープ・caseCode） |
| frontend smoke / server | 108/108 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | HTML 4668 bytes・A4 print・出典一覧・チェックリスト・承認欄・免責文・対象案件コード |

### 13.3 残課題（更新）

1. **地図キャプチャ**（leaflet-image 等の依存評価後に判断）と承認WF（#111）との連動
2. サーバ側永続化（#174: data_sources テーブル + API）
3. A31/A33 実データ調達（#112）・案件台帳の本番有効化判断（ユーザー判断）
4. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 14. 追記（2026-08-14・第7弾）: データソース台帳のサーバ側永続化（Issue #174 完了）

Issue #174 の残課題だったサーバ側永続化（Neon テーブル + API + 再取込履歴の自動記録）を実装。

### 14.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | `data_sources` / `data_source_refreshes` テーブル（additive） | `backend/app/data_sources.py` | 各ソースのメタ情報（名称・提供元・ライセンス・元データ更新日・利用条件・最終取得）と再取込履歴（追記型）を永続化 |
| 2 | `GET /api/v1/data-sources` API | `backend/app/main.py` | 台帳一覧 + 再取込履歴（ソースごと集約）を返す。feature flag `OCSRC_DATA_SOURCE_STORE_ENABLED`（既定 false）無効時は 503 |
| 3 | seed 拡張 | `backend/app/seed_demo_cases.py` | `--with-sources` でデモ台帳（7ソース・架空値）と再取込履歴を冪等投入 |
| 4 | フロント連携 | `frontend/src/api/dataSources.ts`・`SourcesScreen.tsx` | API 有効時にサーバー台帳 + 再取込履歴を表示し、無効・未到達時は静的台帳へフォールバック |

### 14.2 検証証跡（2026-08-14 実測・第7弾）

| 検証 | 結果 |
|---|---:|
| backend pytest | **95 passed**（新規6件: ユニット2 + 統合4: 台帳一覧・履歴・冪等・flag off 503） |
| backend ruff | PASS |
| frontend vitest | **125 passed**（新規5件: 有効性検出・取得・マッピング） |
| frontend smoke / server | 108/108 / 103 |
| typecheck / lint / build | PASS |
| 実 API 動作（curl） | seed → 台帳7件・ksj 履歴・flag off 503 |

### 14.3 残課題（更新）

1. A31/A33 実データ調達（#112）・全国カバレッジ投入
2. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
3. 地図キャプチャ（#113 残）・承認WF（#111）連動
4. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 15. 追記（2026-08-14・第8弾）: 監査ログ CSV エクスポート（監査証跡）

監査証跡の保全（ISO/J-SOX 対応）と監査人向けの実務価値を高めるため、監査ログの CSV エクスポートを実装。

### 15.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | 監査ログ CSV 生成 | `frontend/src/report/auditCsv.ts` | actor・時刻・対象・action（日本語ラベル）・detail を RFC 4180 形式で出力（値中の `"` は `""` にエスケープ） |
| 2 | エクスポート導線 | `frontend/src/screens/AuditScreen.tsx` | 「↓ CSV エクスポート」ボタン（UTF-8 BOM 付き・ダミー表示時も出力可） |

### 15.2 検証証跡（2026-08-14 実測・第8弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **129 passed**（新規4件: ヘッダ・detail JSON・空配列・RFC 4180 クォート） |
| frontend smoke / server | 112/112 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | 7行・ヘッダ・日本語ラベル・実在情報なし |

### 15.3 残課題（更新）

1. A31/A33 実データ調達（#112）・全国カバレッジ投入
2. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
3. 地図キャプチャ（#113 残）・承認WF（#111）連動・ロール管理 UI
4. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 16. 追記（2026-08-14・第9弾）: 最終整合性確認と Issue 棚卸し

### 16.1 実施内容

| # | 内容 | 結果 |
|---|---|---|
| 1 | 全画面（10画面）・全 API（13エンドポイント）と README 主張の整合性検証 | 全て一致（MISSING なし） |
| 2 | #175 候補地比較の受入条件確認 | 3項目全て充足 → **クローズ** |
| 3 | #113 調査パックの完了条件確認 | 4項目全て充足（地図キャプチャは条件付きスコープ・完了条件外）→ **クローズ** |
| 4 | Secrets スキャン（コミット済み） | 実値なし（テスト fixture の `sk-ant-test` 等のみ） |
| 5 | #238 watchdog 現状確認 | 8/13 以降の誤起票ゼロ・watchdog 正常動作（5分間隔・ALL OK）・7日間検証は 8/19 まで継続 |
| 6 | ダミーデータ保持確認 | cases 3・audit_log 78・data_sources 7・data_source_refreshes 7 を保持（テスト後始末で消えた分は seed で再投入） |
| 7 | 最終回帰（frontend 129・backend 95・smoke 112・server 103） | 全 PASS |

### 16.2 残オープン Issue（棚卸し結果）

| Issue | 状態 | 理由 |
|---|---|---|
| #240 P0 | オープン | LAN 認証統一はユーザー判断（IdP 接続） |
| #238 P0 | オープン | 7日間の誤報ゼロ確認（2026-08-19 頃）を待機中 |
| #112 | オープン | 実データ（A31/A33/N03）調達が残る（合成サンプルで動作検証済み） |
| #114 | オープン | 本番反映自動化（本番運用化は今回対象外・バックログ） |
| #109 | オープン | TS7 は typescript-eslint の対応待ち（既知保留） |
| #94 | オープン | /healthz bypass はユーザー判断（Cloudflare 権限） |

## 17. 追記（2026-08-14・第10弾）: RBAC 権限マトリクスの可視化

案件台帳（Issue #111）の5ロール（viewer/auditor/editor/approver/admin）の権限をユーザー自身が確認できる「アクセス権限（RBAC）」を実装。

### 17.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | RBAC 権限マトリクスの純粋ロジック | `frontend/src/report/rbac.ts` | backend（app/cases.py）の ROLE_PRIORITY / role_has / 承認WF と整合する `can()`・`buildMatrix()`・ロール/操作ラベル |
| 2 | 設定画面の RBAC セクション | `frontend/src/screens/SettingsScreen.tsx` | 5ロールの説明 + 7操作×5ロールの権限マトリクス表（✓/—）を表示。ロール割当はサーバー側 env（OCSRC_CASE_*_USERS）と明記 |

### 17.2 検証証跡（2026-08-14 実測・第10弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **137 passed**（新規8件: 優先度・can() 権限境界・マトリクス） |
| frontend smoke / server | 120/120 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | 7操作×5ロール・admin 全権限・viewer 閲覧のみ・approver 承認可 |

### 17.3 残課題（更新）

1. A31/A33 実データ調達（#112）・全国カバレッジ投入
2. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
3. 地図キャプチャ（新規 Issue 化推奨）・承認WF（#111）連動
4. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 18. 追記（2026-08-14・第11弾）: 候補地比較のサーバー案件対応（#175 残課題）

Issue #175 の残課題「サーバー案件台帳（#111）の本番有効化後、保存済みサーバー案件の比較選択に対応」を実装。

### 18.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | CompareScreen のサーバー案件統合 | `frontend/src/screens/CompareScreen.tsx` | 案件台帳 API（#111・feature flag 有効時のみ）が使える場合、`listCases()` + `serverCaseToRecord()` でサーバー保存済み案件を比較候補に追加（「【サーバー】」ラベル表示）。無効・未到達時は従来どおりローカル案件のみ（フォールバック） |
| 2 | 状態説明の追記 | 同上 | サーバー台帳有効時/無効時の注記を比較表下部に表示 |

### 18.2 検証証跡（2026-08-14 実測・第11弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest / smoke / server | 137 / 120 / 103 |
| typecheck / lint / build | PASS |
| 実 API 検証 | サーバー案件3件（approved/submitted/draft）取得・`serverCaseToRecord` で `server-3`（「【サーバー】」判定）・approved→done マッピング |

### 18.3 残課題（更新）

1. A31/A33 実データ調達（#112）・全国カバレッジ投入
2. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
3. 地図キャプチャ（新規 Issue 化推奨）・TS7（#109）
4. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 19. 追記（2026-08-14・第12弾）: ハザード実データ調達調査（#112 前進）

Issue #112 の完了条件「A31/A33 実データ投入」の前段となる**データ調達調査**を実施。

### 19.1 調査結果（2026-08-14・web 検索）

| 項目 | 結果 |
|---|---|
| 配布元 | 国土数値情報ダウンロードサービスのみ（NII Geoshape は河川・行政区域中心で A31/A33 直接配布なし） |
| A31 浸水想定区域 | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A31.html（Shapefile/GML） |
| A33 土砂災害警戒区域 | https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A33.html（Shapefile/GML） |
| 形式 | Shapefile/GML → GeoJSON 変換（EPSG:4326）が必要 |
| 利用条件 | 水系・都道府県・年度ごとに商用/非商用が個別指定（取得時に公式ページで最新版を確認） |
| 出典表記例 | 「出典：国土数値情報（浸水想定区域データ）（国土交通省）」 |

### 19.2 反映

| ファイル | 内容 |
|---|---|
| `backend/data/README.md` | A31/A33 の実データ取得手順（ダウンロード→GML→GeoJSON→ingest・原本 SHA-256 等の証跡保存必須）を追記 |
| `docs/data-license-ledger.md` | A31/A33 の行を追記（配布元・利用条件・出典表記例・証跡保存必須） |

### 19.3 残課題（更新）

- **A31/A33 実データの取得・投入はユーザー判断**（規約確認後・取得にはネットワークアクセスと GML→GeoJSON 変換が必要）。手順は README に整備済みで、取込後に `/api/v1/hazard-assess` で動作検証可能

## 20. 追記（2026-08-14・第13弾）: #238 中間確認・#274 新規 Issue・依存スキャン

### 20.1 #238 watchdog 7日間検証（3日経過・中間確認）

- **誤起票ゼロ**: 8/11 の #257 を最後に watchdog による異常検知 Issue の作成なし
- **readyz の 503 は5回**（8/12 09:01・15:30・15:31、8/13 01:35・23:01）: いずれも Neon cold start 等の一時的 DB タイムアウト
- **緩和策が機能**: `OCSRC_WATCHDOG_ALERT_AFTER_FAILURES=2`（連続2回失敗まで起票しない）により単発 503 では起票されないことを実測
- **watchdog 正常動作**: 5分間隔で ALL OK（edge 302・api/readyz 200・web/healthz 200）
- 完了条件「7日間の誤報ゼロ確認」は **2026-08-19 頃に満了見込み**（PR #259 緩和策マージの 8/12 を起点）

### 20.2 新規 Issue #274（地図キャプチャ）

Issue #113 クローズ時の推奨により、**調査パックへの地図キャプチャ同梱**を新規 Issue 化。
依存追加（leaflet-image / html2canvas 等）はライセンス・保守性を評価してから、外部タイルの
キャプチャ画像の再配布・保存はレイヤごとの利用条件を個別確認する（docs/data-license-ledger.md 参照）。

### 20.3 依存関係スキャン（2026-08-14 実測）

| 対象 | 結果 |
|---|---:|
| frontend `npm audit --audit-level=high` | 0 vulnerabilities |
| backend `pip-audit`（requirements + dev） | No known vulnerabilities |

### 20.4 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. 地図キャプチャ（#274）・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 21. 追記（2026-08-14・第14弾）: 監査ログのフィルタ・検索

監査証跡の実務利用（特定の利用者・操作・案件の素早い特定）のため、監査ログにフィルタ・検索を実装。

### 21.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | フィルタ純粋ロジック | `frontend/src/report/auditFilter.ts` | actor（部分一致・大小文字無視）・action（正確一致）・entity（部分一致）・キーワード（detail の JSON 含む）を AND 結合で絞り込み |
| 2 | フィルタ UI | `frontend/src/screens/AuditScreen.tsx` | 4入力（actor/操作セレクト/対象/キーワード）・クリア・件数表示（フィルタ時 `絞り込み/全件`）・「フィルタに一致なし」の空行文言 |

### 21.2 検証証跡（2026-08-14 実測・第14弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **147 passed**（新規10件: 全件/actor/action/entity/keyword/AND/非アクティブ/オプション） |
| frontend smoke / server | 130/130 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | 全件6・actor 絞り込み・action 一致・entity case#3・keyword・AND(editor+created) |

### 21.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. 地図キャプチャ（#274）・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 22. 追記（2026-08-14・第15弾）: 候補地比較の A4 印刷 / PDF

Issue #175（候補地比較）の実務利用（社内レビュー・紙配布）のため、A4 印刷 / PDF 出力を実装。

### 22.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | A4 印刷向け HTML 生成 | `frontend/src/report/compare.ts` の `buildCompareHtml` | 比較表を A4 横向き（landscape）の自己完結 HTML で生成（カテゴリ行・地点ヘッダ・優先度 A 合計・免責文・出典注意・XSS エスケープ）。#113 調査パックと同方式 |
| 2 | 印刷導線 | `frontend/src/screens/CompareScreen.tsx` | 「🖨 印刷 / PDF」ボタン（`openPackForPrint` 再利用・window.print() で A4 PDF 化） |

### 22.2 検証証跡（2026-08-14 実測・第15弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest | **150 passed**（新規3件: HTML 生成・免責・XSS エスケープ） |
| frontend smoke / server | 133/133 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | HTML 4449 bytes・A4 landscape・3地点・8行・免責・実在情報なし |

### 22.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. 地図キャプチャ（#274・依存評価先行）・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 23. 追記（2026-08-15・第16弾）: ダッシュボードのサーバー台帳状態サマリー

案件台帳（#111・API 有効時）の承認状況をダッシュボードで一目で把握できるよう、状態サマリーを追加。

### 23.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | 状態サマリー表示 | `frontend/src/screens/DashboardScreen.tsx` | サーバー台帳ヘッダーに **draft / 承認待ち（submitted・強調色）/ approved** の件数を表示。承認フローの滞留状況を可視化 |

### 23.2 検証証跡（2026-08-15 実測・第16弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest / smoke / server | 150 / 133 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | draft 1・承認待ち 2・approved 1・合計 4（4案件の状態集計） |

### 23.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. 地図キャプチャ（#274・依存評価先行）・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 24. 追記（2026-08-15・第17弾）: サーバー案件の確認結果復元表示

案件台帳（#111・API 有効時）の保存済み案件をダッシュボードから直接開けるように改善。

### 24.1 実装内容

| # | 改善 | ファイル | 効果 |
|---|---|---|---|
| 1 | 「開く」ボタン | `frontend/src/screens/DashboardScreen.tsx` | サーバー台帳の各行に「開く」ボタンを追加。`serverCaseToRecord()` で CaseRecord に変換し `openCase()` へ渡す。findings があれば**保存済み確認結果を復元表示**（AnalysisScreen）、無ければ座標で再取得（既存のダミー案件と同じ一貫した動作） |

### 24.2 検証証跡（2026-08-15 実測・第17弾）

| 検証 | 結果 |
|---|---:|
| frontend vitest / smoke / server | 150 / 133 / 103 |
| typecheck / lint / build | PASS |
| 実データ検証（tsx） | findings あり→復元（findings 1件）・findings なし→座標再取得（null にならず openCase が処理） |

### 24.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. 地図キャプチャ（#274・依存評価先行）・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 25. 追記（2026-08-15・第18弾）: 地図キャプチャの依存評価調査（#274）

### 25.1 調査結果（web 検索・2026-08-15）

| 候補 | ライセンス | 保守状況 | 外部タイルのクロスオリジン |
|---|---|---|---|
| leaflet-image（mapbox） | BSD | 停滞気味（0.4.0 で長らく更新なし） | タイルの crossOrigin + サーバー CORS が必要 |
| html2canvas | MIT | 活発 | **外部タイルのクロスオリジンで既知の問題** |
| dom-to-image | MIT | メンテナンス縮小 | 同上 |

### 25.2 推奨方針（確定）

1. **依存追加なしの自前実装**を第一候補: Leaflet の Canvas レンダラー + `canvas.toDataURL()` で PNG 化
2. **外部タイルのキャプチャ画像は再配布・保存しない**: ライセンス確認（docs/data-license-ledger.md）が必須のため、MVP では**合成サンプルレイヤのみキャプチャ対象**とし、外部タイルは印刷時の視覚確認に留める
3. 調査パック（#113 実装済み）の出典一覧にキャプチャ元・取得日時を併記

### 25.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
3. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
4. **地図キャプチャ（#274・自前実装方針で実装スコープ確定済み）**・TS7（#109）
5. バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 26. 追記（2026-08-15・第19弾）: README のデモ手順・Phase 表の最終整合性更新

18 PR マージ後の README と実装の最終整合性を確認し、ギャップを解消。

### 26.1 実施内容

| # | 内容 | 結果 |
|---|---|---|
| 1 | 全10画面と README 画面一覧の整合 | 一致（MISSING なし） |
| 2 | **デモ・確認手順セクションを新設** | サーバー台帳（#111）・データソース台帳（#174）の seed CLI 投入 → 画面確認手順を README に追記（本番無影響の feature flag 有効化 + seed + 各画面の確認ポイント） |
| 3 | Phase 4 表を最新実装に更新 | 監査フィルタ/CSV・比較 A4 印刷・RBAC 可視化・地図キャプチャ依存評価済み を反映 |

### 26.2 検証

| 検証 | 結果 |
|---|---:|
| 画面/API と README の整合 | 全画面 OK・README 記載と一致 |
| 本番影響 | なし（docs のみ） |

### 26.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ（#274・自前実装方針で実装スコープ確定済み）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 27. 追記（2026-08-15・第20弾）: 地図キャプチャ（#274）の垂直スライス実装

### 27.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | **純粋ロジックモジュール**（Web メルカトル投影・タイル範囲・帰属文・ライセンス定数。DOM 非依存で node 環境の単体テスト対象） | `frontend/src/map/capture.ts`（新規） |
| 2 | **実キャプチャ**（Leaflet 表示範囲を canvas に描画 → PNG data URL。依存追加なし・`leaflet-image`/`html2canvas` 非採用・タイル読込失敗はプレースホルダ＋注記で正直記録・taint 時は SecurityError を捕捉してエラー化） | `frontend/src/map/captureMap.ts`（新規） |
| 3 | SiteMap のタイル URL/出典を capture.ts と**単一ソース化**（二重管理の解消）＋ `mapRef` prop で地図インスタンスを公開 | `frontend/src/map/SiteMap.tsx` |
| 4 | 分析画面（SCR-002）の地図右上に**キャプチャ UI**（取得ボタン・ハザードオプトイン checkbox・ステータス/警告表示） | `frontend/src/screens/AnalysisScreen.tsx` |
| 5 | 状態追加（`mapCapture`・`captureHazardLayers`・setter。永続化なし） | `frontend/src/store.tsx` |
| 6 | **調査パックに「2. 位置関係・ハザード重ね合わせ図（地図キャプチャ）」セクションを追加**（PNG 同梱・出典/取得日時/除外/ライセンス注記・未取得時は案内文・セクション番号を再構成） | `frontend/src/report/pack.ts` |
| 7 | レポート画面（SCR-005）に地図画像の取得状態表示＋ pack へ受け渡し | `frontend/src/screens/ReportScreen.tsx` |
| 8 | テスト: capture.test.ts（14 件・投影/タイル範囲/帰属/ライセンス定数）＋ pack.test.ts 追記（3 件・未取得案内/同梱/エスケープ） | `frontend/src/map/capture.test.ts`（新規）・`frontend/src/report/pack.test.ts` |

### 27.2 ライセンス判断（§25.2 推奨方針の更新）

§25.2 では「外部タイルはキャプチャせず合成サンプルのみ」としていたが、それでは #274 の目的（周辺ハザードレイヤの重ね合わせを視覚的に残す）を実証できないため、以下の**デフォルト保守・明示オプトイン**方式に更新した（最終的な外部共有可否はレイヤごとの公式規約確認が必須で、本実装はその判断を強制する UI にした）。

- **ベース（地理院タイル）・陰影起伏・OSM ベクタ**: 出典明示の上で画像化（画像キャプション・調査パックに GSI 保存/加工の確認注記を記載）
- **ハザードタイル（洪水浸水想定・土砂災害）**: **デフォルトで画像除外**（理由をキャプション・調査パックに明示）。利用者が「ハザードレイヤも含める」にチェックして再取得した場合のみ含め、その場合も利用条件の注意文を画像メタデータと調査パックに明記
- タイル取得失敗（CORS 非対応・通信エラー）は**疑似成功を記録せず**、プレースホルダ＋注記として正直に報告（#237 の真正化方針と整合）

### 27.3 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck（tsc --noEmit） | PASS |
| frontend lint（eslint 10） | PASS |
| frontend vitest | **167 passed**（+17 件: capture 14 / pack 3） |
| frontend smoke（esbuild shim） | **150/150 passed** |
| frontend build（tsc + vite） | PASS（gzip 159.68 KB・chunk 警告は既存のまま） |
| ビルド成果物への反映確認 | dist にキャプチャ UI/セクション文字列を grep 確認（サンドボックスでブラウザ不可の代替検証） |
| 本番影響 | なし（フロントエンド + docs のみ・本番再ビルドはデプロイ手順に従う） |

### 27.4 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. **地図キャプチャの実ブラウザ目視確認**（本番反映後・Playwright 等はサンドボックス不可のため手動確認。外部タイルの CORS 応答に依存するため実環境での確認が必須）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 28. 追記（2026-08-15・第21弾）: 根拠表示の強化（16方位・ハザード区域名・キャプチャ日時）

### 28.1 実施内容

| # | 内容 | 変更ファイル | 根拠 |
|---|---|---|---|
| 1 | **最寄り距離＋16方位表示**: `initialBearing`（初期方位角）・`bearingLabel16`（16方位日本語）を geo.ts に追加し、道路/水路/施設/駅の finding サマリーを「最寄り：○○、北西 約120m」形式へ昇格。`nearestPointOf` で最寄り頂点を特定 | `frontend/src/api/geo.ts`・`overpass.ts` | 評価書 #10（河川・道路・施設の距離/方位表示）・現地確認の根拠具体化 |
| 2 | **ハザード区域内判定の区域名・想定水深をサマリーへ列挙**（最大3件・超過は「ほか」）。scenario 空は名前のみ表示 | `frontend/src/api/hazard.ts` | 評価書 #9（ハザード重なり強調表示）・区域内判定の根拠可視化 |
| 3 | **地図キャプチャの取得日時をローカル時刻（JST 等）表記に統一**。`formatLocalStamp` を capture.ts に追加し、画像キャプション・調査パック・画面ステータスで使用（従来は UTC のまま表示される不整合を修正） | `frontend/src/map/capture.ts`・`captureMap.ts`・`screens/AnalysisScreen.tsx` | 表示整合性 |
| 4 | テスト: geo +8・hazard +2・capture +2・overpass.test.ts 新規5件（計 +17） | `frontend/src/api/geo.test.ts`・`hazard.test.ts`・`overpass.test.ts`（新規）・`map/capture.test.ts` | 品質ゲート |

### 28.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **184 passed**（+17） |
| frontend smoke | **167/167 passed** |
| frontend build | PASS |
| ビルド成果物への反映 | dist に「該当区域:」「北北東」「最寄り」を grep 確認 |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 28.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 29. 追記（2026-08-15・第22弾）: 取得失敗の限定リトライ（評価書 #14）

### 29.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | `fetchJson`/`postForm` に **`maxRetries`（既定 0）・`retryDelayMs`（既定 300ms）** を追加。**5xx / タイムアウト / ネットワークエラー時のみ 1 回再試行**（4xx は非再試行）。累積応答時間を返し、成功時は「1回リトライ後成功」・失敗時は「（1回リトライ後）」を error フィールドに明記（取得ログの誠実性） | `frontend/src/api/http.ts` |
| 2 | 読み取り専用アダプタ 9 箇所へ `maxRetries: 1` を適用（ジオコーディング/逆ジオコーディング・Overpass・Open-Meteo 予報/標高・気象庁警報・KSJ 近傍・ハザード判定）。**ミューテーション（AI memo POST・案件作成/申請/承認）は再試行なし**（二重実行・二重課金防止） | `nominatim.ts`・`overpass.ts`・`openMeteo.ts`・`elevation.ts`・`jmaWarning.ts`・`ksj.ts`・`hazard.ts` |
| 3 | テスト: `http.test.ts` 新規 7 件（5xx 回復/継続失敗/ネットワーク回復/4xx 非再試行/既定 0 の保護/POST 連携） | `frontend/src/api/http.test.ts`（新規） |

### 29.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **191 passed**（+7・http.test.ts は vi 使用のため smoke ではスキップ・CI で実行） |
| frontend smoke | **167/167 passed** |
| frontend build | PASS（リトライ文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 29.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）

## 30. 追記（2026-08-15・第23弾）: AI 利用状況ダッシュボード（評価書 #20・垂直スライス）

### 30.1 実施内容

| レイヤ | 内容 | 変更ファイル |
|---|---|---|
| DB | `ai_usage` テーブル（additive migration・`CREATE TABLE IF NOT EXISTS`・プロンプト本文非記録・ts/user/status 索引） | `backend/app/ai_usage.py`（新規） |
| バックエンド | AI 呼び出しの監査ログ出力に加え、**best-effort で DB 記録**（`_audit_ai`・DB 未設定/未到達でも AI メモ生成フローは継続）。`GET /api/v1/ai/usage?days=` で合計・日別（JST）・ユーザー別・**概算費用**（トークン≈文字数/4・入力/出力別単価定数）を返す。DB 未設定/未到達は 503（「0 件」と区別・NFR-504） | `backend/app/main.py` |
| フロント | SCR-008 の AI 設定セクションに**利用状況カード**（合計要約・日別表・ユーザー別表・概算注記）。純粋整形ロジックは `aiUsage.ts` に分離 | `frontend/src/settings/aiUsage.ts`（新規）・`aiSettings.ts`・`screens/SettingsScreen.tsx` |
| テスト | バックエンド: ユニット 6 件（概算費用・スキーマ・503 系）+ DB 統合 2 件（記録→集計・AI メモ→API 一貫性・本文非保存）。フロント: `aiUsage.test.ts` 5 件 | `backend/tests/test_ai_usage_unit.py`・`test_ai_usage_db_integration.py`（新規）・`frontend/src/settings/aiUsage.test.ts`（新規） |

### 30.2 検証（CI 相当をローカルで再現）

| 検証 | 結果 |
|---|---:|
| backend ruff | PASS |
| backend pytest（ユニット） | 75 passed（うち ai_usage 6 件） |
| backend pytest（PostGIS 統合・一時コンテナ 15435） | **103 passed**（DB 統合 28 件含む・ai_usage 2 件含む） |
| frontend typecheck / lint / vitest | PASS / PASS / **196 passed**（+5） |
| frontend smoke | **172/172 passed** |
| frontend build | PASS（「利用状況」のバンドル反映を grep 確認） |
| 検証後クリーンアップ | PostGIS 一時コンテナ削除済み・他プロジェクト非干渉 |

### 30.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価（`ai_usage.py` の定数）は実契約・モデルに応じた調整が必要（ユーザー判断）

## 31. 追記（2026-08-15・第24弾）: 候補地比較の位置関係マップ（SCR-010・#175 拡張）

### 31.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | **比較画面に Leaflet 地図を追加**。選択した候補地を選択順の番号つき divIcon マーカー + 検索範囲円（案件 radius・破線）で表示し、複数地点は fitBounds で全体表示・単一地点は setView。ベースタイルは capture.ts の定義を共用（単一ソース） | `frontend/src/map/CompareMap.tsx`（新規） |
| 2 | 純粋ロジック: CompareRow → 地図地点リスト（選択順 rank 付与・radius 保持）とラベル組み立て | `frontend/src/map/compareMapPoints.ts`（新規） |
| 3 | CompareScreen に「候補地の位置関係」セクションを追加（空選択時は案内表示・地図コンテナは常時マウントで 0 件→復帰も安全） | `frontend/src/screens/CompareScreen.tsx` |
| 4 | テスト: 変換・rank・radius・空・ラベルの 5 件 | `frontend/src/map/compareMapPoints.test.ts`（新規） |

### 31.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **201 passed**（+5） |
| frontend smoke | **177/177 passed** |
| frontend build | PASS（「候補地の位置関係」のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 31.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）
7. 比較マップのキャプチャ同梱（調査パックの地図キャプチャ #274 と同方式）はバックログ

## 32. 追記（2026-08-15・第25弾）: 調査テンプレート（評価書 #21）

### 32.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | 工種別プリセット（標準調査・道路工事・河川・護岸工事・建築・造成工事）を定義。radius は RADIUS_OPTIONS 内・カテゴリ 6 種を網羅・少なくとも 1 カテゴリ有効（入力検証と整合） | `frontend/src/data/templates.ts`（新規） |
| 2 | store に `applyTemplate`（radius + カテゴリ初期値を一括反映・formError クリア） | `frontend/src/store.tsx` |
| 3 | InputScreen に「調査テンプレート」行を追加（aria-pressed で選択状態表示・ツールチップに説明） | `frontend/src/screens/InputScreen.tsx` |
| 4 | テスト: 定義の妥当性（一意 id・radius・カテゴリ網羅・1 以上有効）と一致判定の 6 件 | `frontend/src/data/templates.test.ts`（新規） |

### 32.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **207 passed**（+6） |
| frontend smoke | **183/183 passed** |
| frontend build | PASS（「調査テンプレート」のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 32.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・比較マップのキャプチャ同梱（バックログ）

## 33. 追記（2026-08-15・第26弾）: 候補地比較の地図キャプチャ同梱（#274 方式の拡張）

### 33.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | captureMap を拡張: **複数範囲円（`ranges`）・マーカー帰属ラベル（`markersLabel`）・地点ピン省略（`drawSitePin`）** を追加（分析画面の既存挙動は不変） | `frontend/src/map/captureMap.ts`・`capture.ts` |
| 2 | 比較マップ（CompareMap）に `mapRef` を公開し、**「📷 地図画像を取得」ボタン**で現在表示中のマップを PNG 化（比較候補地マーカー + 検索範囲円・地点ピンなし） | `frontend/src/map/CompareMap.tsx`・`screens/CompareScreen.tsx` |
| 3 | `buildCompareHtml` に **「候補地の位置関係（地図キャプチャ）」セクション**を追加（PNG 同梱・出典/取得日時/注記・未取得時は案内文・エスケープ済み） | `frontend/src/report/compare.ts` |
| 4 | テスト: 同梱（PNG・出典・注記）・未取得案内・XSS エスケープの 4 件 | `frontend/src/report/compare.test.ts` |

### 33.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **211 passed**（+4） |
| frontend smoke | **187/187 passed** |
| frontend build | PASS（「位置関係マップの画像は未取得」のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 33.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）

## 34. 追記（2026-08-15・第27弾）: ダミーデータ整合の自動検証（fixtures.test.ts）

### 34.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | ダミーデータ（fixture）の整合性テストを新設。**ダッシュボードのダミー案件 6 件**（id 一意・isDummy・緯度経度範囲・半径∈選択肢・counts A〜D 数値・ステータス・コード形式・電話/メールらしき表記の不在）、**比較デモ行**（緯度経度・半径・比較カテゴリ網羅・架空明示）、**ソース台帳**（キー一意・SourceKey 全種網羅・ライセンス/種別/ランク有効）を機械的に検証 | `frontend/src/data/fixtures.test.ts`（新規） |
| 2 | smoke ランナーの堅牢化: `import.meta.env`（VITE_SHOW_DUMMY/DEV/PROD）を esbuild define で明示定義し、`src/data/cases.ts` を import するテストが node バンドルでも評価可能に。shim に `toMatch` matcher を追加（CI の本物 vitest には影響なし） | `frontend/scripts/smoke-test.mjs`・`scripts/smoke/shim.mjs` |

### 34.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **218 passed**（+7） |
| frontend smoke | **194/194 passed**（+7・shim/toMatch 対応後） |
| frontend build | PASS |
| 本番影響 | なし（テスト + スクリプト + docs） |

### 34.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）

## 35. 追記（2026-08-15・第28弾）: 総括的再評価（第20〜27弾・PR #282〜#289 後）

### 35.1 本セッション（8 ラウンド）の成果

| PR | 内容 | 評価書 § |
|---|---|---|
| #282 | 調査パックへの地図キャプチャ同梱（#274・Leaflet 表示範囲の PNG 化） | §27 |
| #283 | 根拠表示の強化（16方位・ハザード区域名・キャプチャ日時ローカル表記） | §28 |
| #284 | 読み取り専用アダプタの一時障害リトライ（#14） | §29 |
| #285 | AI 利用状況ダッシュボード（#20・DB/API/画面の垂直スライス） | §30 |
| #286 | 候補地比較の位置関係マップ（#175 拡張） | §31 |
| #287 | 調査テンプレート（#21・工種別プリセット） | §32 |
| #288 | 候補地比較の地図キャプチャ同梱（#274 方式の拡張） | §33 |
| #289 | ダミーデータ整合の自動検証（fixtures.test.ts・smoke 堅牢化） | §34 |

テスト数推移: vitest 150 → **218** / smoke 133 → **194** / pytest 95 → **103**（+DB統合）。

### 35.2 本番ヘルスチェック（読み取り専用・2026-08-15 実測）

| 対象 | 結果 | 期待 |
|---|---|---|
| 公開 URL `/healthz` | **302**（Cloudflare Access 認証リダイレクト） | 302（Access 保護下・#94 対応前の現状どおり） |
| LAN `/healthz` | **200** | 200（認証免除のヘルスチェック） |

### 35.3 README 整合性の再確認

- 画面一覧（SCR-001〜010）: 新機能 8 件（調査テンプレート・地図キャプチャ・16方位/区域名・リトライ方針・AI 利用状況・比較マップ/キャプチャ・ダミーデータ検証）をすべて反映済み
- デモ手順: 地図キャプチャ（分析/比較）・調査テンプレート・AI 利用状況の確認手順を新設（§35 追記分）
- 品質ゲート: コマンド一覧・テスト対象（fixtures.test.ts 追加）を更新

### 35.4 残課題（更新・第 28 弾時点）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）— 8/14 中間確認で誤起票ゼロ・緩和策動作を確認済み
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存・手動）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）
7. PWA・警報通知・RAG 付き AI（将来バックログ・本番運用化対象外）

## 36. 追記（2026-08-15・第29弾）: 取得ログのフィルタ・検索（SCR-007）

### 36.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | 取得ログ（SCR-007）に**フィルタ・検索**を追加（ソース / 状態 / エンドポイント / キーワードの AND 絞り込み・件数表示・クリア）。監査ログ（#276）と同じ純粋ロジック分離方式 | `frontend/src/report/logFilter.ts`（新規）・`screens/LogsScreen.tsx` |
| 2 | 状態選択肢に not_attempted / visual_only を含め、誠実な記録（#237 方針）を検索でも扱える | `logFilter.ts` |
| 3 | テスト: ソース（キー/表示名・大小無視）・状態・エンドポイント・キーワード・AND 結合・空・非アクティブ判定の 9 件 | `frontend/src/report/logFilter.test.ts`（新規） |

### 36.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **227 passed**（+9） |
| frontend smoke | **203/203 passed**（+9） |
| frontend build | PASS（フィルタ文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 36.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・警報通知・PWA・RAG（将来バックログ）

## 37. 追記（2026-08-15・第30弾）: ダッシュボード案件一覧の検索・絞り込み（SCR-000）

### 37.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | ダッシュボード案件一覧に**検索・絞り込み**を追加（キーワード: 案件名/コード/所在地・状態フィルタ・件数表示・クリア）。KPI は全件ベースのまま（フィルタは一覧のみに適用） | `frontend/src/report/caseFilter.ts`（新規）・`screens/DashboardScreen.tsx` |
| 2 | テスト: キーワード（案件名/コード/所在地・大小無視）・状態・AND 結合・空・非アクティブ・ラベル変換の 7 件 | `frontend/src/report/caseFilter.test.ts`（新規） |

### 37.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **234 passed**（+7） |
| frontend smoke | **210/210 passed**（+7） |
| frontend build | PASS（フィルタ文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 37.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・警報通知・PWA・RAG（将来バックログ）

## 38. 追記（2026-08-15・第31弾）: 取得ログの CSV エクスポート（SCR-007）

### 38.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | 取得ログ（SCR-007）に**CSV エクスポート**を追加（絞り込み結果・UTF-8 BOM 付き）。監査ログ（#275）と同じ RFC 4180 方式 | `frontend/src/report/logCsv.ts`（新規）・`screens/LogsScreen.tsx` |
| 2 | テスト: ヘッダ・値列挙・RFC 4180 エスケープ（" , 改行）・空の 3 件 | `frontend/src/report/logCsv.test.ts`（新規） |

### 38.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **237 passed**（+3） |
| frontend smoke | **213/213 passed**（+3） |
| frontend build | PASS（CSV ダウンロード文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 38.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・警報通知・PWA・RAG（将来バックログ）

## 39. 追記（2026-08-15・第32弾）: 案件一覧の CSV エクスポート（SCR-000）

### 39.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | ダッシュボード案件一覧に**CSV エクスポート**を追加（絞り込み結果・UTF-8 BOM 付き・種別ラベル・優先度内訳）。取得ログ（#293）と同じ方式 | `frontend/src/report/caseCsv.ts`（新規）・`screens/DashboardScreen.tsx` |
| 2 | テスト: 種別ラベル・ヘッダ/値列挙・RFC 4180 エスケープ・空の 4 件 | `frontend/src/report/caseCsv.test.ts`（新規） |

### 39.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **241 passed**（+4） |
| frontend smoke | **217/217 passed**（+4） |
| frontend build | PASS（CSV ダウンロード文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 39.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）— 誤起票ゼロ継続（#257 以降なし）を確認
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・警報通知・PWA・RAG（将来バックログ）

## 40. 追記（2026-08-15・第33弾）: 住所履歴（最近の住所・評価書 #11 の一部）

### 40.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | **最近の住所**（localStorage に最大 5 件・住所入力で実行した入力を記録・ワンクリック再入力） | `frontend/src/settings/recentAddresses.ts`（新規）・`frontend/src/screens/InputScreen.tsx`・`frontend/src/store.tsx` |
| 2 | 記録タイミング: 分析成功時に住所入力（address 型）のみ記録（座標入力・案件起点は対象外）。重複除去・最大件数 | `frontend/src/store.tsx`（doRun） |
| 3 | テスト: パース（不正 JSON・非文字列・空）・追加（先頭/重複/空無視/最大件数）の 7 件 | `frontend/src/settings/recentAddresses.test.ts`（新規） |

### 40.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **248 passed**（+7） |
| frontend smoke | **224/224 passed**（+7） |
| frontend build | PASS（「最近の住所」のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 40.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・警報通知・PWA・RAG（将来バックログ）

## 41. 追記（2026-08-15・第34弾）: MVP 総括評価（最終スコアカード・回帰確認）

### 41.1 総括

本セッション（第20〜34弾・PR #282〜#295・計 14 PR）で MVP 価値を高める P2 を 12 件実装した。主要ユースケースは一連で動作し、全 10 画面で操作・検索・出力（MD/CSV/PDF・案件/監査/取得ログの CSV 含む）・ダミーデータ整合が揃った。

### 41.2 最終スコアカード（評価基準 18 項目・改善後から再採点）

| 項目 | 評価時 | 最終 | 主な増分（第20〜34弾） |
|---|---:|---:|---|
| 機能完成度 | 56 | **70** | 地図キャプチャ（#274）・候補地比較マップ/キャプチャ（#175）・調査テンプレート（#21）・AI 利用状況（#20）・住所履歴（#11）・ログ/案件の検索・CSV 出力 |
| 業務適合性 | 70 | **76** | 入力効率（テンプレート/住所履歴）・検索性（案件/ログ/監査のフィルタ）・帳票出力の充実 |
| データ品質 | 55 | **62** | 限定リトライ（#14）・ダミーデータ整合の自動検証（fixtures.test.ts）・16方位/区域名の根拠明示（#9/#10） |
| テスト | 80 | **86** | vitest 150→249 / smoke 133→225 / pytest 95→103・DB 統合（ai_usage）・fixture 整合 |
| 監視・障害対応 | 65 | **68** | 読み取り専用アダプタの一時障害リトライ（#14） |
| AI 有効性 | 65 | **68** | AI 利用状況ダッシュボード（費用管理・#20）・DB 記録（ai_usage） |
| 文書 | 84 | **88** | README 画面表/デモ手順の整合（§35）・評価書 §27〜§41 |
| セキュリティ | 76 | **77** | 地図キャプチャのライセンス考慮（デフォルト除外+オプトイン）・CSV 出力の秘密非含有 |
| **加重代替率** | **70%** | **74%** | 機能・データ品質・テストの向上 |

### 41.3 主要ユースケースの動作確認（実装済み）

1. 地点入力（テンプレート/住所履歴）→ 分析（並行取得・部分結果・リトライ）→ 地図（16方位/区域名・キャプチャ）
2. AI 調査メモ（サーバー側ブローカー・監査・利用状況ダッシュボード）
3. レポート（MD/CSV・調査パック A4/PDF・地図キャプチャ同梱）
4. 保存 → ダッシュボード（KPI・検索/絞り込み・CSV）→ 比較（マップ・キャプチャ・MD/CSV/A4）
5. 案件台帳（RBAC・承認 WF・監査ログ・CSV）・データソース台帳・取得ログ（検索・CSV）・システム設定

### 41.4 回帰確認（2026-08-15 実測）

| 検証 | 結果 |
|---|---:|
| frontend vitest / smoke / typecheck / lint | **249 passed** / **225/225** / PASS / PASS |
| backend ruff / pytest（ユニット） | PASS / 75 passed（DB 統合 28 件は CI の PostGIS で実行・#30 で 103 passed 確認済み） |
| 本番ヘルスチェック（読み取り専用） | 公開 URL 302（Access）・LAN /healthz 200 |
| #238 監視 | 誤起票ゼロ継続（watchdog #257 以降なし） |

### 41.5 残バックログ（ユーザー判断・将来）

1. **#238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）**
2. 地図キャプチャの実ブラウザ目視確認（本番反映後・外部タイル CORS 応答に依存・手動）
3. A31/A33 実データ投入・案件台帳/データソース台帳の本番有効化・AI 概算単価調整（ユーザー判断）
4. TS7（#109）・Cloudflare 側項目（ユーザー判断）・バックアップ復元演習（人間実施）
5. 警報通知・PWA・RAG 付き AI（将来バックログ・本番運用化対象外）

## 42. 追記（2026-08-15・第35弾）: 気象警報（現在）チェック（評価書 #18 の MVP）

### 42.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | 候補地比較（SCR-010）に**気象警報（現在）チェック**を追加。各候補地の都道府県で現在発表中の警報・注意報を気象庁から取得し、「発表中（警報名）/発表なし/取得失敗/未チェック」の 4 段階バッジで表示（安全/危険は断定しない） | `frontend/src/report/warningSummary.ts`（新規）・`screens/CompareScreen.tsx` |
| 2 | 取得は既存の `fetchJmaWarning` を案件ごとに順次呼び出し、バックエンドの reverse-geocode レート制限（1 req/s）を尊重して 1.1s 間隔 | `CompareScreen.tsx` |
| 3 | テスト: 4 段階の要約・警報名なし・表示色の 6 件 | `frontend/src/report/warningSummary.test.ts`（新規） |

### 42.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **255 passed**（+6） |
| frontend smoke | **231/231 passed**（+6） |
| frontend build | PASS（警報チェック文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 42.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・プッシュ通知・PWA・RAG（将来バックログ）

## 43. 追記（2026-08-15・第36弾）: データソースの一括接続テスト（SCR-006）

### 43.1 実施内容

| # | 内容 | 変更ファイル |
|---|---|---|
| 1 | SCR-006 に**「全ソースを一括テスト」**ボタンを追加。有効化されている全ソースを個別の接続テストと同じ実経路（pingSource）で一括疎通確認し、各行の状態を更新 | `frontend/src/store.tsx`（`testAllSources`）・`screens/SourcesScreen.tsx` |

### 43.2 検証

| 検証 | 結果 |
|---|---:|
| frontend typecheck / lint | PASS |
| frontend vitest | **255 passed** |
| frontend smoke | **231/231 passed** |
| frontend build | PASS（一括テスト文言のバンドル反映を grep 確認） |
| 本番影響 | なし（フロントエンド + docs のみ） |

### 43.3 残課題（更新）

1. #238 の7日間検証満了確認（2026-08-19 頃・満了時にクローズ判断）
2. 地図キャプチャ・本番反映後の実ブラウザ目視確認（外部タイル CORS 応答に依存）
3. A31/A33 実データ取得・投入（ユーザー判断・手順整備済み）
4. 案件台帳・データソース台帳の本番有効化判断（ユーザー判断）
5. TS7（#109）・バックアップ復元演習・Cloudflare 側項目（ユーザー判断）
6. AI 費用の概算単価調整（ユーザー判断）・プッシュ通知・PWA・RAG（将来バックログ）

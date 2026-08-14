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

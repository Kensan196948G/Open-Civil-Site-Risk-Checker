# 改善台帳・検証証跡・再評価（2026-08-12）

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
| secret スキャン | 実値なし | テスト fixture のみ（`sk-ant-test` 等） |
| 本番実挙動（SubAgent 確認） | LAN 直 403 / 公開 URL 302 / healthz 200 / readyz db ok | 2026-08-12 |

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

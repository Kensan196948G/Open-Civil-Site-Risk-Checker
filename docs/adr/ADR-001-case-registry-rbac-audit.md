# ADR-001: 案件台帳のサーバ側永続化・RBAC・監査ログ・承認ワークフロー

- ステータス: **Accepted**（2026-08-14）
- 関連 Issue: [#111](https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker/issues/111)（案件台帳 + 監査ログ + 承認付きレポート）
- 外部評価: 2026-07-24 最重要推奨「案件台帳 + 監査ログ + 承認付きレポート」

## 背景と動機

現状の案件データはフロントエンドの `localStorage` 中心で、組織利用・共有端末・監査に弱い
（外部評価の弱み指摘）。サーバ側に案件データを永続化し、ロールベースのアクセス制御（RBAC）と
操作の監査証跡を設けることで、単なる便利デモから社内の初期調査プロダクトへ引き上げる。

## 決定

1. **DB は PostgreSQL（既存 Neon）に additive テーブルを追加する**
   - `cases`: 案件の基本情報・地点・確認結果スナップショット（counts / findings JSONB）
   - `audit_log`: 操作証跡（追記型。actor・時刻・対象・action・detail）
   - 既存 `ksj_features` には非干渉（`CREATE TABLE IF NOT EXISTS`・既存スキーマ変更なし）
2. **RBAC はアプリケーション層で実施する**
   - ロール: `viewer / editor / approver / admin / auditor` の5段階（上位は下位を包含）
   - 認証: web 層（server.mjs）が Cloudflare Access JWT を検証後に付与する
     `X-OCSRC-User` 内部ヘッダを actor として使用（クライアント直送分は web 層で除去・偽装不可）
   - ロール割当: サーバ側環境変数 `OCSRC_CASE_*_USERS`（カンマ区切り）。未割当は viewer
3. **承認ワークフローは最小の状態遷移 `draft → submitted → approved`**
   - 遷移は逐次のみ許可（draft→approved の直接遷移は 409）
   - approved 案件の更新は admin のみ（事後の再編集は admin 特権）
4. **監査ログは `case_created / case_submitted / case_approved / case_updated / case_deleted`**
   - 本文（プロンプト等）・秘密情報は記録しない
   - 削除しても監査エントリは残す（証跡の改ざん防止）
5. **feature flag `OCSRC_CASE_STORE_ENABLED`（既定 false）で本番無影響**
   - 無効時は全案件 API が 503（依存解決で body 検証より先に判定）
   - 本番は未有効のまま。ロール割当運用・監査ログ保全方針を定めてから有効化

## 代替案（検討済み・不採用）

| 案 | 不採用の理由 |
|---|---|
| 既存 localStorage のまま | 共有端末・監査・ロール制御に弱く、外部評価の指摘を解消できない |
| 認証・ロールを Cloudflare Access のみに委ねる | Access は境界認証であり、アプリ内のロール（viewer/editor/approver 等）を表現できない |
| フル機能の OIDC/Entra ID を今回導入 | 本番 IdP 接続（#240）はユーザー判断の別トラック。MVP は既存 Access JWT の user 識別子で開始し、IdP 確定後にロール属性へ接続できる設計にする |

## 影響

- **本番**: なし（feature flag 既定 off・本番設定未変更）
- **API 追加**: `/api/v1/cases*`・`/api/v1/audit`（web プロキシで POST/PATCH/DELETE 許可）
- **フロント**: 案件保存をサーバー優先・localStorage フォールバックに昇格。台帳セクション・監査ログ画面（SCR-009）
- **テスト**: backend 22件（RBAC 境界10 + DB 統合12）+ seed 3件、frontend 15件（案件 API・監査表示）

## 受入条件

- [x] additive migration が冪等（再実行で重複なし）
- [x] RBAC の権限境界（viewer/editor/approver/admin/auditor）の異常系テスト
- [x] 承認WF（draft→submitted→approved・不正遷移 409・approved 更新は admin のみ）
- [x] 監査ログ記録 + 閲覧（auditor ロール・entity フィルタ）
- [x] feature flag 無効時の 503
- [x] ダミーデータ（seed CLI）投入・保持

## 将来の拡張（バックログ）

- IdP（Entra ID 等）確定後のロール属性連携（#240）
- 監査ログの保全・エクスポート、管理画面（ロール管理 UI）
- 案件への添付（PDF 調査パック #113）

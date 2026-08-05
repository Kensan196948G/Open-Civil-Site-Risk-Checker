# バックアップ・リストア手順（P0）

> 外部評価（2026-08-05）Phase 0 対応。Neon の 24 時間 PITR に加え、独立した
> 論理バックアップ（pg_dump）と復元演習手順を用意する。

## 現状

- Neon 標準: 24 時間の Point-in-Time Restore（`history_retention_seconds: 86400`）
- 追加する独立バックアップ: 日次論理ダンプ（`scripts/backup-neon.sh`）
- 目標: 24 時間より前の破損・誤投入からも復旧できる経路を確保する

## 1. 論理バックアップ（日次推奨）

```bash
# 本番ホスト上で、API 実行ユーザーで実行（/etc/ocsrc/api.env から DSN を読む）
sudo -u ocsrc scripts/backup-neon.sh

# 手動実行例（環境変数を明示）
OCSRC_API_ENV_FILE=/etc/ocsrc/api.env OCSRC_BACKUP_DIR=/var/backups/ocsrc \
  sudo -u "$(stat -c %U /etc/ocsrc/api.env)" scripts/backup-neon.sh
```

生成物:

- `/var/backups/ocsrc/ocsrc-YYYYmmdd-HHMMSS.dump`（custom format・`--no-owner`）
- 同一名の `.sha256`（改ざん・破損検知用）
- 保持日数（既定 30 日）を過ぎたダンプは自動削除

systemd timer 例（`/etc/systemd/system/ocsrc-backup.timer`）:

```ini
[Unit]
Description=Daily OCSRC logical backup

[Timer]
OnCalendar=*-*-* 03:17:00
RandomizedDelaySec=600
Persistent=true

[Install]
WantedBy=timers.target
```

## 2. リストア（復元演習）

復元先は「別環境」を原則とする（本番を直接上書きしない）。

### 2.1 ローカル / 一時 Neon ブランチへ復元

```bash
# 例: ローカル PostGIS へ復元（docker compose の phase2 を利用）
sha256sum -c /var/backups/ocsrc/ocsrc-XXXX.dump.sha256   # ★ pg_restore より前に必ず検証（CodeRabbit #241 指摘対応）
createdb -h 127.0.0.1 -U postgres ocsrc_restore
pg_restore --no-owner --no-privileges \
  -h 127.0.0.1 -U postgres -d ocsrc_restore /var/backups/ocsrc/ocsrc-XXXX.dump
```

> ハッシュ検証が失敗した場合は **pg_restore を実行せず**、バックアップの再取得または別世代を選ぶこと。

Neon の場合はコンソールまたは Neon MCP で復元用ブランチを作成し、その DSN へ
`pg_restore` する。**本番 `main` ブランチへは直接リストアしない。**

### 2.2 復元後の検証（必須）

1. `ksj_features` の件数・最終取得日時がバックアップ時点と一致
2. サンプル地点の `/api/v1/nearby` が 200 を返し、件数が期待どおり
3. `/livez` が 200、`/readyz` が `db:ok`
4. ダンプの SHA-256 が一致（`sha256sum -c`。復元前検証で実施済みのため、復元後は任意の再確認）

### 2.3 復元演習の記録

演習のたびに次を Issue / 文書へ記録する:

- 日時・担当
- バックアップファイル名・SHA-256
- 復元先（ローカル/ブランチ）
- 検証結果（nearby 件数・healthz・経過時間）

## 3. 停止条件

- 復元先が特定できない、または本番へ直接リストアしそうな操作は実行しない
- DSN をログ・Issue・文書へ出力しない
- バックアップが無い状態で破壊的操作をしない

## 4. 残課題

- 復元演習の定期化（四半期 1 回）とその証跡
- 外部ストレージ（別リージョン等）へのバックアップ退避
- バックアップ自体の監視（失敗通知）

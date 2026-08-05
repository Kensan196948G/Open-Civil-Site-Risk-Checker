#!/usr/bin/env bash
# OCSRC Neon の論理バックアップ（pg_dump）。
# - /etc/ocsrc/api.env の OCSRC_DATABASE_URL を読み取り、custom format で保存
# - 保存先: /var/backups/ocsrc（env で上書き可）
# - 保持日数超過分は自動削除（既定 30 日）
#
# 使い方:
#   sudo -u <api実行ユーザー> scripts/backup-neon.sh
#
# 環境変数:
#   OCSRC_API_ENV_FILE   API 環境ファイル（既定 /etc/ocsrc/api.env）
#   OCSRC_BACKUP_DIR     保存先ディレクトリ（既定 /var/backups/ocsrc）
#   OCSRC_BACKUP_RETENTION_DAYS 保持日数（既定 30）
set -euo pipefail

ENV_FILE="${OCSRC_API_ENV_FILE:-/etc/ocsrc/api.env}"
BACKUP_DIR="${OCSRC_BACKUP_DIR:-/var/backups/ocsrc}"
RETENTION_DAYS="${OCSRC_BACKUP_RETENTION_DAYS:-30}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[backup-neon] ERROR: ${ENV_FILE} が見つかりません" >&2
  exit 1
fi

# DSN を環境へ取り込む（出力・ログには出さない）。
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${OCSRC_DATABASE_URL:-}" ]]; then
  echo "[backup-neon] ERROR: OCSRC_DATABASE_URL が ${ENV_FILE} に設定されていません" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup-neon] ERROR: pg_dump が見つかりません（postgresql-client をインストールしてください）" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
stamp="$(date +%Y%m%d-%H%M%S)"
out="${BACKUP_DIR}/ocsrc-${stamp}.dump"

pg_dump --no-owner --no-privileges --format=custom "${OCSRC_DATABASE_URL}" > "${out}"
sha256sum "${out}" > "${out}.sha256"

echo "[backup-neon] saved ${out} ($(du -h "${out}" | cut -f1))"
echo "[backup-neon] sha256: $(awk '{print $1}' "${out}.sha256")"

# 保持日数超過分を削除（バックアップディレクトリ内の ocsrc-*.dump のみ対象）。
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'ocsrc-*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'ocsrc-*.dump.sha256' -mtime "+${RETENTION_DAYS}" -delete

echo "[backup-neon] done (retention: ${RETENTION_DAYS} days)"

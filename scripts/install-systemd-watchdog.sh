#!/usr/bin/env bash
# ocsrc-watchdog（本番ヘルスチェック + GitHub Issue 通知）を systemd timer として常駐化する。
# - /etc/systemd/system/ocsrc-watchdog.service（oneshot）と .timer（5 分間隔）を生成
# - enable --now で有効化し、初回チェックを即時実行して結果を表示
#
# 前提: 実行ユーザー（RUN_USER）で `gh auth status` が通ること（Issue 起票に使用）。
#       gh が未認証でもチェック自体は動くが、通知は journal ログのみになる。
#
# 使い方:  scripts/install-systemd-watchdog.sh
set -euo pipefail

SERVICE=ocsrc-watchdog
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
TIMER_PATH="/etc/systemd/system/${SERVICE}.timer"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WATCHDOG="${PROJECT_DIR}/scripts/ocsrc-watchdog.sh"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "${RUN_USER}")"

[[ -x "${WATCHDOG}" ]] || chmod +x "${WATCHDOG}"

if ! command -v gh >/dev/null 2>&1; then
  echo "[install-watchdog] WARN: gh CLI が見つかりません。異常検知しても Issue 通知は行われません。" >&2
fi

sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Open Civil Site Risk Checker health watchdog (issue-based alerting)
Documentation=https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker/blob/main/docs/deploy-backend.md

[Service]
Type=oneshot
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${PROJECT_DIR}
# gh / curl / systemctl の解決に必要な最小 PATH
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/bin/bash ${WATCHDOG}
# 低リスク sandboxing（gh 設定が \$HOME 配下のため ProtectHome は付けない）
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
EOF

sudo tee "${TIMER_PATH}" >/dev/null <<EOF
[Unit]
Description=Run ocsrc-watchdog every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE}.timer"

echo "[install-watchdog] timer を有効化しました。初回チェックを実行します..."
sudo systemctl start "${SERVICE}.service" || true
sudo systemctl --no-pager --full status "${SERVICE}.service" | head -12 || true
echo "[install-watchdog] 次回以降のスケジュール: systemctl list-timers ${SERVICE}.timer"

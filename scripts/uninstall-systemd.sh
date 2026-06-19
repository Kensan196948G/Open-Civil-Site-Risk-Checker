#!/usr/bin/env bash
# OCSRC Web の systemd サービスを停止・無効化・削除する（インストールの逆操作）。
set -euo pipefail
SERVICE=ocsrc-web
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"

sudo systemctl disable --now "${SERVICE}.service" 2>/dev/null || true
if [[ -f "${UNIT_PATH}" ]]; then
  sudo rm -f "${UNIT_PATH}"
  echo "removed ${UNIT_PATH}"
fi
sudo systemctl daemon-reload
sudo systemctl reset-failed "${SERVICE}.service" 2>/dev/null || true
echo "uninstalled ${SERVICE}"

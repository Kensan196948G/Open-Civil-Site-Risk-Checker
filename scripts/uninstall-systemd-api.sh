#!/usr/bin/env bash
# OCSRC API の systemd サービスを停止・無効化・削除する（インストールの逆操作）。
# /etc/ocsrc/api.env（DB 資格情報）は保持する。不要なら手動で削除:
#   sudo rm -f /etc/ocsrc/api.env
set -euo pipefail
SERVICE=ocsrc-api
WEB_SERVICE=ocsrc-web
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
WEB_UNIT_PATH="/etc/systemd/system/${WEB_SERVICE}.service"

sudo systemctl disable --now "${SERVICE}.service" 2>/dev/null || true
if [[ -f "${UNIT_PATH}" ]]; then
  sudo rm -f "${UNIT_PATH}"
  echo "removed ${UNIT_PATH}"
fi

# install-systemd-api.sh が ocsrc-web へ注入した OCSRC_BACKEND_ORIGIN を除去する。
WEB_NEEDS_RESTART=0
if [[ -f "${WEB_UNIT_PATH}" ]] && grep -q '^Environment=OCSRC_BACKEND_ORIGIN=' "${WEB_UNIT_PATH}"; then
  sudo sed -i '/^Environment=OCSRC_BACKEND_ORIGIN=/d' "${WEB_UNIT_PATH}"
  WEB_NEEDS_RESTART=1
fi

sudo systemctl daemon-reload
if [[ "${WEB_NEEDS_RESTART}" == "1" ]]; then
  sudo systemctl try-restart "${WEB_SERVICE}.service" 2>/dev/null || true
fi
sudo systemctl reset-failed "${SERVICE}.service" 2>/dev/null || true
echo "uninstalled ${SERVICE}"

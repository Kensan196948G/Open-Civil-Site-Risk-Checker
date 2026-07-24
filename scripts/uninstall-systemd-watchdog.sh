#!/usr/bin/env bash
# ocsrc-watchdog の systemd timer / service を無効化して撤去する（rollback 用）。
# 使い方:  scripts/uninstall-systemd-watchdog.sh
set -euo pipefail

SERVICE=ocsrc-watchdog

sudo systemctl disable --now "${SERVICE}.timer" 2>/dev/null || true
sudo systemctl stop "${SERVICE}.service" 2>/dev/null || true
sudo rm -f "/etc/systemd/system/${SERVICE}.timer" "/etc/systemd/system/${SERVICE}.service"
sudo systemctl daemon-reload
echo "[uninstall-watchdog] ${SERVICE}.timer / .service を撤去しました。"

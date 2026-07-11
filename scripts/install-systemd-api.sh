#!/usr/bin/env bash
# Open Civil Site Risk Checker API (FastAPI) を systemd システムサービスとして常駐化する。
# - backend/.venv を構築（requirements.txt）
# - 実行ユーザ・空きポート（8000-8099）を検出
# - /etc/ocsrc/api.env を生成（既存なら保持・上書きしない、chmod 600）
# - /etc/systemd/system/ocsrc-api.service を生成して enable + restart
# - ocsrc-web.service に OCSRC_BACKEND_ORIGIN を注入（server.mjs same-origin プロキシ用）
#
# 前提: DB (PostGIS) は docker compose の db サービスで稼働していること:
#   cd infra && docker compose --profile phase2 up -d db
# 全体手順は docs/deploy-backend.md を参照。
#
# 使い方:  scripts/install-systemd-api.sh            # ポートは既存設定 or 8000 から自動選択
#          PORT=8010 scripts/install-systemd-api.sh  # ポート明示
# 一般ユーザで実行する（sudo は内部の必要箇所のみ。sudo 実行すると venv が root 所有になる）。
set -euo pipefail

SERVICE=ocsrc-api
WEB_SERVICE=ocsrc-web
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
WEB_UNIT_PATH="/etc/systemd/system/${WEB_SERVICE}.service"
ENV_DIR=/etc/ocsrc
ENV_FILE="${ENV_DIR}/api.env"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "${RUN_USER}")"

PYTHON_BIN="$(command -v python3 || true)"
if [[ -z "${PYTHON_BIN}" ]]; then
  echo "ERROR: python3 が見つかりません。" >&2
  exit 1
fi

# --- ポート決定: 明示 PORT > 既存ユニットの --port > 8000 から空きを探索 ---
port_in_use() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q . ; }
# PORT はユニット生成時に sed/ExecStart へ直接埋め込まれるため、非数値や範囲外を弾く。
validate_port() {
  local p="$1"
  if [[ ! "${p}" =~ ^[0-9]+$ ]] || (( p < 1 || p > 65535 )); then
    echo "ERROR: PORT は 1-65535 の整数で指定してください（受け取った値: '${p}'）。" >&2
    exit 1
  fi
}
choose_port() {
  if [[ -n "${PORT:-}" ]]; then validate_port "${PORT}"; echo "${PORT}"; return; fi
  if [[ -f "${UNIT_PATH}" ]]; then
    local existing
    existing="$(grep -oP -- '--port \K[0-9]+' "${UNIT_PATH}" 2>/dev/null || true)"
    if [[ -n "${existing}" ]]; then echo "${existing}"; return; fi
  fi
  local p
  for p in $(seq 8000 8099); do
    if ! port_in_use "${p}"; then echo "${p}"; return; fi
  done
  echo "ERROR: 8000-8099 に空きポートがありません。" >&2
  exit 1
}
SEL_PORT="$(choose_port)"

echo "==> venv 構築 (${BACKEND_DIR})"
cd "${BACKEND_DIR}"
[[ -d .venv ]] || "${PYTHON_BIN}" -m venv .venv
.venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt
UVICORN_BIN="${BACKEND_DIR}/.venv/bin/uvicorn"
if [[ ! -x "${UVICORN_BIN}" ]]; then
  echo "ERROR: ${UVICORN_BIN} がありません（venv 構築に失敗）。" >&2
  exit 1
fi

# --- EnvironmentFile: 既存は保持、新規のみ生成（DB 資格情報はリポジトリ外で管理） ---
# infra/.env（compose 側、コミット対象外）から DB 名/ユーザ/ポートだけ引き継ぐ。source はしない。
compose_env() {
  local key="$1" default="$2" file="${PROJECT_DIR}/infra/.env" v=""
  if [[ -f "${file}" ]]; then
    v="$(grep -oP "^${key}=\K.*" "${file}" 2>/dev/null | tail -n1 || true)"
  fi
  echo "${v:-${default}}"
}
DB_NAME="$(compose_env OCSRC_DB_NAME site_risk_checker)"
DB_USER="$(compose_env OCSRC_DB_USER app)"
DB_PORT="$(compose_env OCSRC_DB_PORT 5432)"

echo "==> EnvironmentFile: ${ENV_FILE}"
sudo mkdir -p "${ENV_DIR}"
if [[ -f "${ENV_FILE}" ]]; then
  echo "    既存の ${ENV_FILE} を保持します（上書きしません）。"
else
  sudo tee "${ENV_FILE}" >/dev/null <<EOF
# OCSRC API 本番設定（リポジトリ外・コミット禁止）。
# CHANGE_ME_STRONG_PASSWORD は必ず強パスワードへ変更すること（要変更）。
# 値は infra/.env の OCSRC_DB_PASSWORD（PostGIS コンテナ側）と一致させる。
# 変更後: sudo systemctl restart ocsrc-api
OCSRC_APP_ENV=production
OCSRC_DATABASE_URL=postgresql://${DB_USER}:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:${DB_PORT}/${DB_NAME}
EOF
  echo "    生成しました。パスワード（CHANGE_ME_STRONG_PASSWORD）を必ず変更してください。"
fi
sudo chown root:root "${ENV_FILE}"
sudo chmod 600 "${ENV_FILE}"

echo "==> ユニット生成: ${UNIT_PATH}"
echo "    user=${RUN_USER} group=${RUN_GROUP} uvicorn=${UVICORN_BIN} port=${SEL_PORT}"
sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Open Civil Site Risk Checker API (OCSRC FastAPI)
Documentation=https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${UVICORN_BIN} app.main:app --host 127.0.0.1 --port ${SEL_PORT}
Restart=always
RestartSec=3
NoNewPrivileges=true
# --- 低リスク sandboxing（venv/WorkingDirectory が \$HOME 配下のため ProtectHome は付けない） ---
PrivateTmp=true
ProtectSystem=full
ProtectControlGroups=true
ProtectKernelTunables=true
ProtectKernelModules=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF

# --- ocsrc-web へ OCSRC_BACKEND_ORIGIN を注入（値が変わったときだけ再起動） ---
BACKEND_ORIGIN="http://127.0.0.1:${SEL_PORT}"
WEB_NEEDS_RESTART=0
echo "==> ${WEB_SERVICE} へ OCSRC_BACKEND_ORIGIN=${BACKEND_ORIGIN} を注入"
if [[ -f "${WEB_UNIT_PATH}" ]]; then
  CURRENT_ORIGIN="$(grep -oP '^Environment=OCSRC_BACKEND_ORIGIN=\K\S+' "${WEB_UNIT_PATH}" 2>/dev/null || true)"
  if [[ "${CURRENT_ORIGIN}" == "${BACKEND_ORIGIN}" ]]; then
    echo "    既に設定済みのためスキップ。"
  elif [[ -n "${CURRENT_ORIGIN}" ]]; then
    sudo sed -i "s|^Environment=OCSRC_BACKEND_ORIGIN=.*|Environment=OCSRC_BACKEND_ORIGIN=${BACKEND_ORIGIN}|" "${WEB_UNIT_PATH}"
    WEB_NEEDS_RESTART=1
  else
    sudo sed -i "/^ExecStart=/i Environment=OCSRC_BACKEND_ORIGIN=${BACKEND_ORIGIN}" "${WEB_UNIT_PATH}"
    WEB_NEEDS_RESTART=1
  fi
else
  echo "    ${WEB_UNIT_PATH} が未インストールのためスキップ"
  echo "    （scripts/install-systemd.sh 実行後に本スクリプトを再実行すると注入されます）。"
fi

echo "==> 有効化 & 起動"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE}.service"
sudo systemctl restart "${SERVICE}.service"
if [[ "${WEB_NEEDS_RESTART}" == "1" ]]; then
  # try-restart: web が稼働中のときだけ再起動して新しい環境変数を反映する。
  sudo systemctl try-restart "${WEB_SERVICE}.service" 2>/dev/null || true
fi
sleep 1
sudo systemctl --no-pager --full status "${SERVICE}.service" | head -8 || true

echo ""
echo "==> 起動完了"
echo "    ヘルス:   curl http://127.0.0.1:${SEL_PORT}/healthz"
echo "    ログ:     journalctl -u ${SERVICE} -f"
echo "    注意:     ${ENV_FILE} のパスワードが CHANGE_ME のままだと db は error になります。"
echo "              設定手順は docs/deploy-backend.md を参照。"

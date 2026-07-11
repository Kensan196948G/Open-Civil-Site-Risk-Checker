#!/usr/bin/env bash
# Open Civil Site Risk Checker を systemd システムサービスとして常駐化する。
# - フロントエンドをビルド（dist/）
# - node 絶対パス・実行ユーザ・空きポートを検出
# - /etc/systemd/system/ocsrc-web.service を生成して enable --now
#
# 使い方:  scripts/install-systemd.sh            # ポートは既存設定 or 8700 から自動選択
#          PORT=8750 scripts/install-systemd.sh  # ポート明示
set -euo pipefail

SERVICE=ocsrc-web
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${PROJECT_DIR}/frontend"
RUN_USER="${SUDO_USER:-$(id -un)}"
RUN_GROUP="$(id -gn "${RUN_USER}")"

NODE_BIN="$(command -v node || true)"
NODE_BIN="$(readlink -f "${NODE_BIN}" 2>/dev/null || echo "${NODE_BIN}")"
if [[ -z "${NODE_BIN}" || ! -x "${NODE_BIN}" ]]; then
  echo "ERROR: node が見つかりません。" >&2
  exit 1
fi

# --- ポート決定: 明示 PORT > 既存ユニットの PORT > 8700 から空きを探索 ---
port_in_use() { ss -ltnH "sport = :$1" 2>/dev/null | grep -q . ; }
# PORT はユニットの Environment=PORT へ直接埋め込まれるため、非数値や範囲外を弾く。
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
    existing="$(grep -oP 'Environment=PORT=\K[0-9]+' "${UNIT_PATH}" 2>/dev/null || true)"
    if [[ -n "${existing}" ]]; then echo "${existing}"; return; fi
  fi
  local p
  for p in $(seq 8700 8799); do
    if ! port_in_use "${p}"; then echo "${p}"; return; fi
  done
  echo "ERROR: 8700-8799 に空きポートがありません。" >&2
  exit 1
}
SEL_PORT="$(choose_port)"

# 既存ユニットに scripts/install-systemd-api.sh が注入した OCSRC_BACKEND_ORIGIN が
# あれば引き継ぐ（再インストールで消さない）。
BACKEND_ORIGIN=""
if [[ -f "${UNIT_PATH}" ]]; then
  BACKEND_ORIGIN="$(grep -oP '^Environment=OCSRC_BACKEND_ORIGIN=\K\S+' "${UNIT_PATH}" 2>/dev/null || true)"
fi
# フォールバック: 「API 先 → web 後から新規」の順序では、API installer が web ユニット未在で
# 注入をスキップしており引き継ぎ元が無い。その場合は ocsrc-api ユニットの --port から補完する。
if [[ -z "${BACKEND_ORIGIN}" ]]; then
  API_UNIT_PATH="/etc/systemd/system/ocsrc-api.service"
  if [[ -f "${API_UNIT_PATH}" ]]; then
    API_PORT="$(grep -oP -- '--port \K[0-9]+' "${API_UNIT_PATH}" 2>/dev/null || true)"
    if [[ -n "${API_PORT}" ]]; then
      BACKEND_ORIGIN="http://127.0.0.1:${API_PORT}"
      echo "==> ocsrc-api の --port ${API_PORT} から OCSRC_BACKEND_ORIGIN を補完"
    fi
  fi
fi

echo "==> ビルド (${FRONTEND_DIR})"
cd "${FRONTEND_DIR}"
[[ -d node_modules ]] || npm install --no-audit --no-fund
npm run build

echo "==> ユニット生成: ${UNIT_PATH}"
echo "    user=${RUN_USER} group=${RUN_GROUP} node=${NODE_BIN} port=${SEL_PORT}"
sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Open Civil Site Risk Checker Web (OCSRC SPA)
Documentation=https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${FRONTEND_DIR}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${SEL_PORT}
ExecStart=${NODE_BIN} server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
# --- 低リスク sandboxing（WorkingDirectory が \$HOME 配下のため ProtectHome は付けない） ---
PrivateTmp=true
ProtectSystem=full
ProtectControlGroups=true
ProtectKernelTunables=true
ProtectKernelModules=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF

if [[ -n "${BACKEND_ORIGIN}" ]]; then
  echo "==> OCSRC_BACKEND_ORIGIN=${BACKEND_ORIGIN} を引き継ぎ"
  sudo sed -i "/^ExecStart=/i Environment=OCSRC_BACKEND_ORIGIN=${BACKEND_ORIGIN}" "${UNIT_PATH}"
fi

echo "==> 有効化 & 起動"
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE}.service"
sleep 1
sudo systemctl --no-pager --full status "${SERVICE}.service" | head -8 || true

LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
echo ""
echo "==> 起動完了"
echo "    ローカル:  http://127.0.0.1:${SEL_PORT}/"
[[ -n "${LAN_IP}" ]] && echo "    LAN:      http://${LAN_IP}:${SEL_PORT}/"
echo "    ヘルス:   curl http://127.0.0.1:${SEL_PORT}/healthz"

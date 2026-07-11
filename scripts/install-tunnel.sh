#!/usr/bin/env bash
# Open Civil Site Risk Checker — Cloudflare Tunnel を systemd サービスとして常駐化する。
#
# riskchecker.mirai-dx-platform.com -> (Cloudflare Edge, TLS 終端) -> Tunnel
#   -> localhost:8700 (ocsrc-web / server.mjs) -> /api -> ocsrc-api (127.0.0.1:8000)
#
# 前提:
#   - cloudflared がインストール済みで `cloudflared tunnel login` 済み（~/.cloudflared/cert.pem）
#   - トンネル ocsrc-riskchecker が作成済み（cloudflared tunnel create ocsrc-riskchecker）
#   - ~/.cloudflared/ocsrc-config.yml が存在（tunnel id + ingress + credentials-file）
#   - ocsrc-web.service が稼働（scripts/install-systemd.sh）
#   - 【重要】公開前に Basic 認証を設定していること（/etc/ocsrc/web.env、Issue #66）
#
# このスクリプトは unit の導入 + enable + start までを行う。
# DNS ルート（= 一般公開スイッチ）は既定で作成せず、環境変数 CREATE_DNS_ROUTE=1 の
# ときだけ実行する。公開は人間の明示判断で行うこと。
set -euo pipefail

SERVICE=ocsrc-tunnel
UNIT_PATH="/etc/systemd/system/${SERVICE}.service"
TUNNEL_NAME=ocsrc-riskchecker
HOSTNAME_FQDN=riskchecker.mirai-dx-platform.com
WEB_ENV=/etc/ocsrc/web.env
RUN_USER="${SUDO_USER:-$(id -un)}"
USER_HOME="$(getent passwd "${RUN_USER}" | cut -d: -f6)"
CONFIG="${USER_HOME}/.cloudflared/ocsrc-config.yml"

CLOUDFLARED_BIN="$(command -v cloudflared || true)"
if [[ -z "${CLOUDFLARED_BIN}" ]]; then
  echo "ERROR: cloudflared が見つかりません。" >&2
  exit 1
fi
if [[ ! -f "${CONFIG}" ]]; then
  echo "ERROR: ${CONFIG} がありません。先に tunnel を作成し config を用意してください。" >&2
  exit 1
fi

# --- 公開前の認証設定チェック（fail-safe: 未設定なら公開を止める） ---
# server.mjs は未設定でも Tunnel 経由を 503 にするが、運用ミスを二重で防ぐ。
# USER / PASS の両方が非空であることを要求する（PASS 欠落だと TUNNEL_AUTH_ENABLED=false）。
if [[ ! -f "${WEB_ENV}" ]] \
  || ! grep -q '^OCSRC_TUNNEL_BASIC_USER=..*' "${WEB_ENV}" 2>/dev/null \
  || ! grep -q '^OCSRC_TUNNEL_BASIC_PASS=..*' "${WEB_ENV}" 2>/dev/null; then
  echo "ERROR: ${WEB_ENV} に OCSRC_TUNNEL_BASIC_USER / OCSRC_TUNNEL_BASIC_PASS（両方）が未設定です。" >&2
  echo "       インターネット公開前に Basic 認証を設定してください（Issue #66）:" >&2
  echo "         sudo install -m 600 /dev/null ${WEB_ENV}" >&2
  echo "         echo 'OCSRC_TUNNEL_BASIC_USER=<user>' | sudo tee -a ${WEB_ENV}" >&2
  echo "         echo 'OCSRC_TUNNEL_BASIC_PASS=<strong-pass>' | sudo tee -a ${WEB_ENV}" >&2
  echo "         sudo systemctl restart ocsrc-web" >&2
  exit 1
fi

# --- ネットワーク境界の注意喚起（対抗レビュー指摘・多層防御） ---
# 認証は「Tunnel 経由（cf-connecting-ip 付き）」にのみ効く。origin(:8700) を
# 信頼できないネットワークから直接到達可能にすると、cf-connecting-ip なしで
# 認証を回避できてしまう。Tunnel はアウトバウンド専用でインバウンド開放不要のため、
# 8700 は WAN へ絶対に port-forward しないこと（LAN 内のみ到達可の想定）。
echo "==> 注意: origin :8700 は信頼 LAN 内のみ到達可能に保つこと（WAN へ port-forward 禁止）。"
echo "         インターネット到達はこの Cloudflare Tunnel（アウトバウンド専用）だけに限定される。"

echo "==> ユニット生成: ${UNIT_PATH}（user=${RUN_USER}）"
sudo tee "${UNIT_PATH}" >/dev/null <<EOF
[Unit]
Description=Open Civil Site Risk Checker Cloudflare Tunnel (cloudflared)
Documentation=https://github.com/Kensan196948G/Open-Civil-Site-Risk-Checker/blob/main/docs/deploy-backend.md
After=network-online.target ocsrc-web.service
Wants=network-online.target
Requires=ocsrc-web.service

[Service]
Type=simple
User=${RUN_USER}
Restart=always
RestartSec=5
ExecStart=${CLOUDFLARED_BIN} tunnel --config ${CONFIG} run
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

echo "==> 有効化 & 起動"
sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE}.service"
sleep 2
sudo systemctl --no-pager --full status "${SERVICE}.service" | head -8 || true

# --- DNS ルート（一般公開スイッチ） ---
# 既定では作成しない。CREATE_DNS_ROUTE=1 のときだけ CNAME を張る。
if [[ "${CREATE_DNS_ROUTE:-0}" == "1" ]]; then
  echo "==> DNS ルート作成: ${HOSTNAME_FQDN} -> ${TUNNEL_NAME}"
  "${CLOUDFLARED_BIN}" tunnel route dns "${TUNNEL_NAME}" "${HOSTNAME_FQDN}"
  echo "    公開しました: https://${HOSTNAME_FQDN}/"
else
  echo "==> DNS ルート未作成（公開保留）。公開する場合は次を実行:"
  echo "      cloudflared tunnel route dns ${TUNNEL_NAME} ${HOSTNAME_FQDN}"
  echo "    または CREATE_DNS_ROUTE=1 scripts/install-tunnel.sh"
fi

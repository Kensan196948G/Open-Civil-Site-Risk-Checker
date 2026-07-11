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
# cloudflared を root で常駐させない。root 直実行（sudo なし）だと RUN_USER=root に
# 解決され、systemd ユニットの User と DNS route 実行が root になってしまう。
# 一般ユーザで実行すること（sudo は内部の必要箇所のみ）。
if [[ "${RUN_USER}" == "root" ]]; then
  echo "ERROR: root で実行しないでください。cloudflared を所有する一般ユーザで実行してください" >&2
  echo "       （tunnel の cert.pem / config を持つユーザ。sudo はスクリプト内部でのみ使用）。" >&2
  exit 1
fi
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

# --- ingress 転送先ポートと ocsrc-web の実ポートの整合チェック ---
# ocsrc-web は PORT=... で 8700 以外にも導入できる（install-systemd.sh）。config の
# ingress が実ポートと食い違うと、Tunnel は起動するが閉じた origin へ転送し公開が壊れる。
WEB_UNIT="/etc/systemd/system/ocsrc-web.service"
WEB_PORT="$(grep -oP '^Environment=PORT=\K[0-9]+' "${WEB_UNIT}" 2>/dev/null || true)"
CONFIG_PORT="$(grep -oP 'service:\s*https?://[^:/]+:\K[0-9]+' "${CONFIG}" 2>/dev/null | head -1 || true)"
if [[ -n "${WEB_PORT}" && -n "${CONFIG_PORT}" && "${WEB_PORT}" != "${CONFIG_PORT}" ]]; then
  echo "ERROR: ${CONFIG} の転送先ポート(${CONFIG_PORT})が ocsrc-web の実ポート(${WEB_PORT})と不一致です。" >&2
  echo "       ${CONFIG} の ingress を http://localhost:${WEB_PORT} に修正してから再実行してください。" >&2
  exit 1
fi

# --- 公開前の認証設定チェック（fail-safe: 未設定なら公開を止める） ---
# server.mjs は未設定でも Tunnel 経由を 503 にするが、運用ミスを二重で防ぐ。
# USER / PASS の両方が非空であることを要求する（PASS 欠落だと TUNNEL_AUTH_ENABLED=false）。
# web.env は root:root 600 のため一般ユーザでは読めない。存在確認・内容検証とも
# sudo 経由で行う（このスクリプトは一般ユーザ実行・sudo は内部利用という前提）。
if ! sudo test -f "${WEB_ENV}" \
  || ! sudo grep -q '^OCSRC_TUNNEL_BASIC_USER=..*' "${WEB_ENV}" \
  || ! sudo grep -q '^OCSRC_TUNNEL_BASIC_PASS=..*' "${WEB_ENV}"; then
  echo "ERROR: ${WEB_ENV} に OCSRC_TUNNEL_BASIC_USER / OCSRC_TUNNEL_BASIC_PASS（両方）が未設定です。" >&2
  echo "       インターネット公開前に Basic 認証を設定してください（Issue #66）:" >&2
  echo "         sudo install -m 600 /dev/null ${WEB_ENV}" >&2
  echo "         echo 'OCSRC_TUNNEL_BASIC_USER=<user>' | sudo tee -a ${WEB_ENV}" >&2
  echo "         echo 'OCSRC_TUNNEL_BASIC_PASS=<strong-pass>' | sudo tee -a ${WEB_ENV}" >&2
  echo "         sudo systemctl restart ocsrc-web" >&2
  exit 1
fi

# --- 公開前ランタイムプローブ（実挙動で認証が効いているか確認） ---
# web.env が存在しても、稼働中の ocsrc-web が unit に EnvironmentFile 未配線・未再起動
# だと server.mjs は認証を無効と見なし Tunnel 経由を 503 にする。静的チェックだけでは
# これを検出できないため、cf-connecting-ip 付きリクエストを実際に打って 401（＝認証有効）
# を確認する。503（未設定）や 200（ゲート無効）なら壊れた公開を防ぐため停止する。
PROBE_PORT="${WEB_PORT:-8700}"
PROBE_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 5 \
  -H 'CF-Connecting-IP: 203.0.113.1' "http://127.0.0.1:${PROBE_PORT}/" 2>/dev/null || true)"
if [[ "${PROBE_CODE}" != "401" ]]; then
  echo "ERROR: ocsrc-web が Tunnel 経由の認証を有効化していません（probe=${PROBE_CODE:-無応答}, 期待=401）。" >&2
  if [[ "${PROBE_CODE}" == "503" ]]; then
    echo "       web.env が unit に未反映です。unit を再生成して再起動してください:" >&2
    echo "         bash scripts/install-systemd.sh" >&2
  elif [[ "${PROBE_CODE}" == "200" ]]; then
    echo "       cf-connecting-ip 付きでも認証されていません（想定外）。server.mjs のバージョンを確認してください。" >&2
  else
    echo "       ocsrc-web が :${PROBE_PORT} で稼働しているか確認してください（systemctl status ocsrc-web）。" >&2
  fi
  exit 1
fi
echo "==> 公開前プローブ OK: Tunnel 経由リクエストは 401（認証有効）を返しています。"

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
# enable --now は稼働中ユニットを再起動しない。再実行で unit（cloudflared パス・
# config パス・User 等）が変わっても反映されるよう try-restart する（web 側と同じ）。
sudo systemctl try-restart "${SERVICE}.service"
sleep 2
sudo systemctl --no-pager --full status "${SERVICE}.service" | head -8 || true

# --- DNS ルート（一般公開スイッチ） ---
# 既定では作成しない。CREATE_DNS_ROUTE=1 のときだけ CNAME を張る。
CERT_PEM="${USER_HOME}/.cloudflared/cert.pem"
if [[ "${CREATE_DNS_ROUTE:-0}" == "1" ]]; then
  echo "==> DNS ルート作成: ${HOSTNAME_FQDN} -> ${TUNNEL_NAME}"
  # cloudflared は HOME/.cloudflared/cert.pem でアカウント認証する。sudo 実行時は
  # HOME=/root になり cert.pem を見失うため、tunnel 所有ユーザで実行し cert を明示する。
  sudo -u "${RUN_USER}" env HOME="${USER_HOME}" \
    "${CLOUDFLARED_BIN}" --origincert "${CERT_PEM}" tunnel route dns "${TUNNEL_NAME}" "${HOSTNAME_FQDN}"
  echo "    公開しました: https://${HOSTNAME_FQDN}/"
else
  echo "==> DNS ルート未作成（公開保留）。公開する場合は次を実行:"
  echo "      cloudflared --origincert ${CERT_PEM} tunnel route dns ${TUNNEL_NAME} ${HOSTNAME_FQDN}"
  echo "    または CREATE_DNS_ROUTE=1 scripts/install-tunnel.sh"
fi

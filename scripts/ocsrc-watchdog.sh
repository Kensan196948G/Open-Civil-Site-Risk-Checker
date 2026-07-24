#!/usr/bin/env bash
# ocsrc 本番ヘルスチェック watchdog（ocsrc-watchdog.timer から 5 分間隔で呼ばれる想定）。
#
# 目的: Cloudflare Alerting・外形監視（Issue #94）が未設定でも、LAN 内から
#       web / api / DB / tunnel / エッジの死活を検知し、異常時に GitHub Issue を
#       自動起票して通知を成立させる（GitHub の watch 通知＝メール/モバイルが届く）。
#
# チェック項目:
#   1. systemd : ocsrc-web / ocsrc-api / ocsrc-tunnel が active
#   2. web     : GET http://127.0.0.1:8700/healthz が 200
#   3. api+db  : GET http://127.0.0.1:8000/healthz が 200 かつ "db":"ok"（Neon 到達性込み）
#   4. edge    : GET https://riskchecker.mirai-dx-platform.com/healthz が 200/302
#                ※ 302 = Cloudflare Access の正常応答。Access はエッジで Tunnel より
#                  手前に立つため、この確認は DNS/TLS/エッジ経路の死活であって
#                  Tunnel 死活ではない（Tunnel はチェック 1 の systemd active で担保）。
#
# 通知（gh CLI・実行ユーザーの認証を使用。secret は扱わない）:
#   - 異常時: ラベル `watchdog` の open Issue が無ければ新規起票、あればコメント追記
#   - 回復時: open な watchdog Issue に回復コメントを付けてクローズ（1 障害 = 1 Issue）
#   - gh が使えない/失敗した場合は journal へのログのみ（exit 1 で timer 失敗として可視化）
#
# 環境変数:
#   OCSRC_WATCHDOG_DRY_RUN=1   Issue 起票/クローズせず判定のみ出力（テスト用）
#   OCSRC_WATCHDOG_SKIP_EDGE=1 エッジ確認をスキップ（外部到達性のない環境用）
#   OCSRC_WATCHDOG_WEB_URL / _API_URL / _EDGE_URL  チェック先の上書き（異常系テスト用）
#
# 個々のチェック失敗で中断せず全項目を集約するため、set -e は意図的に使わない。
set -uo pipefail

REPO="Kensan196948G/Open-Civil-Site-Risk-Checker"
WEB_URL="${OCSRC_WATCHDOG_WEB_URL:-http://127.0.0.1:8700/healthz}"
API_URL="${OCSRC_WATCHDOG_API_URL:-http://127.0.0.1:8000/healthz}"
EDGE_URL="${OCSRC_WATCHDOG_EDGE_URL:-https://riskchecker.mirai-dx-platform.com/healthz}"
LABEL="watchdog"
DRY_RUN="${OCSRC_WATCHDOG_DRY_RUN:-0}"
SKIP_EDGE="${OCSRC_WATCHDOG_SKIP_EDGE:-0}"

failures=()
results=()

log() { echo "[ocsrc-watchdog] $*"; }

record() { # record <name> <ok|NG> <detail>
  results+=("$1: $2 ($3)")
  [[ "$2" == "NG" ]] && failures+=("$1: $3")
}

# --- 1. systemd 各サービス ---
for svc in ocsrc-web ocsrc-api ocsrc-tunnel; do
  state="$(systemctl is-active "${svc}" 2>/dev/null || true)"
  if [[ "${state}" == "active" ]]; then
    record "systemd/${svc}" ok "active"
  else
    record "systemd/${svc}" NG "state=${state:-unknown}"
  fi
done

# curl は接続失敗時も -w が 000 を出力しつつ非 0 で終了するため、|| echo で足すと
# 000000 に化ける。出力をそのまま使い、空のときだけ 000 へフォールバックする。
http_code() { local c; c="$(curl -m 15 -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)"; echo "${c:-000}"; }

# --- 2. web healthz ---
code="$(http_code "${WEB_URL}")"
if [[ "${code}" == "200" ]]; then
  record "web/healthz" ok "200"
else
  record "web/healthz" NG "HTTP ${code}"
fi

# --- 3. api healthz（DB 到達性込み） ---
body="$(curl -m 15 -s "${API_URL}" || true)"
code="$(http_code "${API_URL}")"
if [[ "${code}" == "200" && "${body}" == *'"db":"ok"'* ]]; then
  record "api/healthz" ok "200 db:ok"
else
  # healthz のボディは status/db/version のみで secret を含まない
  record "api/healthz" NG "HTTP ${code} body=${body:0:120}"
fi

# --- 4. エッジ（DNS/TLS/Cloudflare 経路） ---
if [[ "${SKIP_EDGE}" == "1" ]]; then
  record "edge" ok "skipped (OCSRC_WATCHDOG_SKIP_EDGE=1)"
else
  code="$(http_code "${EDGE_URL}")"
  if [[ "${code}" == "200" || "${code}" == "302" ]]; then
    record "edge" ok "HTTP ${code}"
  else
    record "edge" NG "HTTP ${code}"
  fi
fi

# --- 結果サマリ（journal に残す） ---
now="$(date '+%Y-%m-%d %H:%M:%S %Z')"
for r in "${results[@]}"; do log "${r}"; done

find_open_issue() {
  gh issue list -R "${REPO}" --label "${LABEL}" --state open --limit 1 \
    --json number --jq '.[0].number // empty' 2>/dev/null || true
}

if [[ ${#failures[@]} -eq 0 ]]; then
  log "ALL OK (${now})"
  if [[ "${DRY_RUN}" == "1" ]]; then
    log "dry-run: 回復処理はスキップ"
    exit 0
  fi
  open_issue="$(find_open_issue)"
  if [[ -n "${open_issue}" ]]; then
    log "回復検知 -> Issue #${open_issue} をクローズ"
    gh issue close "${open_issue}" -R "${REPO}" \
      --comment "✅ **回復検知（${now}）**: 全チェック（systemd×3 / web / api+db / edge）が正常に戻りました。$(printf '%s\n' '' '```' "${results[@]}" '```')" \
      || log "WARN: Issue クローズに失敗（gh 認証・ネットワークを確認）"
  fi
  exit 0
fi

log "FAILURES=${#failures[@]} (${now})"
if [[ "${DRY_RUN}" == "1" ]]; then
  log "dry-run: Issue 起票はスキップ"
  exit 1
fi

detail="$(printf '%s\n' "## 検知内容（${now}）" '' '```' "${results[@]}" '```' '' \
  "## 一次対応" \
  "- \`systemctl status ocsrc-web ocsrc-api ocsrc-tunnel\` で該当サービスを確認" \
  "- \`curl http://127.0.0.1:8000/healthz\` で DB 到達性（Neon）を確認" \
  "- 手順: docs/deploy-backend.md の「運用チェックリスト」参照" \
  "" "_ocsrc-watchdog による自動検知（5 分間隔）_")"

open_issue="$(find_open_issue)"
if [[ -n "${open_issue}" ]]; then
  log "既存 Issue #${open_issue} へ追記"
  gh issue comment "${open_issue}" -R "${REPO}" --body "🚨 **継続異常** ${detail}" \
    || { log "ERROR: Issue コメントに失敗"; exit 1; }
else
  log "新規 Issue を起票"
  gh label create "${LABEL}" -R "${REPO}" \
    --description "ocsrc-watchdog による自動検知" --color D93F0B 2>/dev/null || true
  gh issue create -R "${REPO}" --label "${LABEL}" \
    --title "[watchdog] 本番ヘルスチェック異常検知（${now}）" \
    --body "🚨 ${detail}" \
    || { log "ERROR: Issue 起票に失敗（gh 認証・ネットワークを確認）"; exit 1; }
fi
exit 1

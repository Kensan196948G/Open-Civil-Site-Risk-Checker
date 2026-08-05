#!/usr/bin/env bash
# ocsrc 本番ヘルスチェック watchdog（ocsrc-watchdog.timer から 5 分間隔で呼ばれる想定）。
#
# 外部評価 Phase 0 対応（2026-08-05）:
#   - DB フラップによる Issue スパムを防ぐため、1 障害 = 1 Issue のインシデント集約と
#     継続異常コメントの抑制（既定 30 分間隔）を導入した。
#   - api チェックは /readyz（DB 異常時 503）を使用し、Neon の serverless cold start を
#     吸収する再試行（既定 1 回・10 秒後）を行う。
#   - 回復は連続 2 回の OK を確認してから Issue をクローズする（フラップによる開閉を減らす）。
#
# チェック項目:
#   1. systemd : ocsrc-web / ocsrc-api / ocsrc-tunnel が active
#   2. web     : GET http://127.0.0.1:8700/healthz が 200（SPA 配信可能）
#   3. api+db  : GET http://127.0.0.1:8000/readyz が 200 かつ "db":"ok"（Neon 到達性込み）
#   4. edge    : GET https://riskchecker.mirai-dx-platform.com/healthz が 200/302
#                ※ 302 = Cloudflare Access の正常応答。DNS/TLS/エッジ経路の死活確認。
#
# 通知（gh CLI・実行ユーザーの認証を使用。secret は扱わない）:
#   - 異常時: ラベル `watchdog` の open Issue が無ければ新規起票、あれば抑制間隔を
#     守りながらコメント追記（1 障害 = 1 Issue）
#   - 回復時: 連続 OK を確認してから回復コメントを付けてクローズ
#   - gh が使えない/失敗した場合は journal へのログのみ（exit 1 で timer 失敗として可視化）
#
# 環境変数:
#   OCSRC_WATCHDOG_DRY_RUN=1        Issue 起票/クローズせず判定のみ出力（テスト用）
#   OCSRC_WATCHDOG_STATE_DIR        状態ディレクトリ（既定 /var/lib/ocsrc-watchdog）
#   OCSRC_WATCHDOG_RETRY_DELAY      異常時再試行の待機秒（既定 10）
#   OCSRC_WATCHDOG_COMMENT_INTERVAL 継続異常コメントの最小間隔秒（既定 1800）
#   OCSRC_WATCHDOG_RECOVERY_OK_CHECKS 回復確定に必要な連続 OK 回数（既定 2）
#   OCSRC_WATCHDOG_SKIP_EDGE=1      エッジ確認をスキップ（外部到達性のない環境用）
#   OCSRC_WATCHDOG_WEB_URL / _API_URL / _EDGE_URL  チェック先の上書き（異常系テスト用）
#
# 個々のチェック失敗で中断せず全項目を集約するため、set -e は意図的に使わない。
set -uo pipefail

REPO="Kensan196948G/Open-Civil-Site-Risk-Checker"
WEB_URL="${OCSRC_WATCHDOG_WEB_URL:-http://127.0.0.1:8700/healthz}"
API_URL="${OCSRC_WATCHDOG_API_URL:-http://127.0.0.1:8000/readyz}"
EDGE_URL="${OCSRC_WATCHDOG_EDGE_URL:-https://riskchecker.mirai-dx-platform.com/healthz}"
LABEL="watchdog"
DRY_RUN="${OCSRC_WATCHDOG_DRY_RUN:-0}"
SKIP_EDGE="${OCSRC_WATCHDOG_SKIP_EDGE:-0}"
STATE_DIR="${OCSRC_WATCHDOG_STATE_DIR:-/var/lib/ocsrc-watchdog}"
STATE_FILE="${STATE_DIR}/state"
RETRY_DELAY="${OCSRC_WATCHDOG_RETRY_DELAY:-10}"
COMMENT_INTERVAL="${OCSRC_WATCHDOG_COMMENT_INTERVAL:-1800}"
RECOVERY_OK_CHECKS="${OCSRC_WATCHDOG_RECOVERY_OK_CHECKS:-2}"

failures=()
results=()

log() { echo "[ocsrc-watchdog] $*"; }

record() { # record <name> <ok|NG> <detail>
  results+=("$1: $2 ($3)")
  [[ "$2" == "NG" ]] && failures+=("$1: $3")
}

# ---- 状態（インシデント集約用） ----
load_state() {
  ACTIVE=0
  ISSUE_NUMBER=""
  FIRST_SEEN=""
  LAST_COMMENT_AT=""
  FAILURE_COUNT=0
  CONSECUTIVE_OK=0
  if [[ -f "${STATE_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${STATE_FILE}"
  fi
}

save_state() {
  mkdir -p "${STATE_DIR}" || { log "ERROR: state dir を作成できません: ${STATE_DIR}"; exit 1; }
  local tmp="${STATE_FILE}.tmp.$$"
  cat > "${tmp}" <<EOF
ACTIVE=${ACTIVE}
ISSUE_NUMBER=${ISSUE_NUMBER}
FIRST_SEEN='${FIRST_SEEN}'
LAST_COMMENT_AT=${LAST_COMMENT_AT}
FAILURE_COUNT=${FAILURE_COUNT}
CONSECUTIVE_OK=${CONSECUTIVE_OK}
EOF
  mv -f "${tmp}" "${STATE_FILE}"
}

find_open_issue() {
  gh issue list -R "${REPO}" --label "${LABEL}" --state open --limit 1 \
    --json number --jq '.[0].number // empty' 2>/dev/null || true
}

now="$(date '+%Y-%m-%d %H:%M:%S %Z')"
epoch="$(date +%s)"
load_state

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
http_code() { local c; c="$(curl -m 20 -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || true)"; echo "${c:-000}"; }

# ボディと応答時間をまとめて取得（secret を含まない readyz 応答のみ）。
# グローバル FETCH_CODE / FETCH_MS を現在のシェルに設定する（コマンド置換のサブシェル問題を避ける）。
fetch() { # fetch <url> <body_file>
  local url="$1" body_file="$2"
  FETCH_CODE="$(curl -m 20 -s -o "${body_file}" -w '%{http_code}' "${url}" 2>/dev/null || true)"
  FETCH_CODE="${FETCH_CODE:-000}"
  FETCH_MS="$(curl -m 20 -s -o /dev/null -w '%{time_total}' "${url}" 2>/dev/null || true)"
  FETCH_MS="${FETCH_MS:-—}"
}

# --- 2. web healthz ---
code="$(http_code "${WEB_URL}")"
if [[ "${code}" == "200" ]]; then
  record "web/healthz" ok "200"
else
  record "web/healthz" NG "HTTP ${code}"
fi

# --- 3. api readiness（DB 到達性込み、cold start 吸収の再試行つき） ---
api_check() {
  local body_file body code
  body_file="$(mktemp 2>/dev/null || echo "${STATE_DIR}/body.$$")"
  fetch "${API_URL}" "${body_file}"
  body="$(cat "${body_file}" 2>/dev/null || true)"
  code="${FETCH_CODE}"
  if [[ "${code}" == "200" && "${body}" == *'"db":"ok"'* ]]; then
    record "api/readyz" ok "200 db:ok (${FETCH_MS}s)"
    rm -f "${body_file}"
    return 0
  fi
  # Neon serverless の cold start / 一時的な接続失敗は再試行で吸収する。
  log "api/readyz NG を検知（HTTP ${code}）。${RETRY_DELAY}s 後に再試行します..."
  sleep "${RETRY_DELAY}"
  fetch "${API_URL}" "${body_file}"
  body="$(cat "${body_file}" 2>/dev/null || true)"
  code="${FETCH_CODE}"
  if [[ "${code}" == "200" && "${body}" == *'"db":"ok"'* ]]; then
    record "api/readyz" ok "200 db:ok (retry, ${FETCH_MS}s)"
    rm -f "${body_file}"
    return 0
  fi
  record "api/readyz" NG "HTTP ${code} body=${body:0:140}"
  rm -f "${body_file}"
  return 1
}
api_check

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
for r in "${results[@]}"; do log "${r}"; done

issue_body() {
  local kind="$1"
  printf '%s\n' "## ${kind}（${now}）" "" '```' "${results[@]}" '```' "" \
    "## 経過" \
    "- 初回検知: ${FIRST_SEEN:-（今回）}" \
    "- 累積失敗回数: ${FAILURE_COUNT}" \
    "- 状態: インシデント集約中（1 障害 = 1 Issue、回復は連続 ${RECOVERY_OK_CHECKS} 回 OK で確定）" \
    "" \
    "## 一次対応" \
    "- \`systemctl status ocsrc-web ocsrc-api ocsrc-tunnel\` で該当サービスを確認" \
    "- \`curl http://127.0.0.1:8000/readyz\` で DB 到達性（Neon）を確認" \
    "- 手順: docs/deploy-backend.md の「運用チェックリスト」参照" \
    "" \
    "_ocsrc-watchdog による自動検知（5 分間隔・インシデント集約・${COMMENT_INTERVAL}s コメント抑制）_"
}

if [[ ${#failures[@]} -eq 0 ]]; then
  CONSECUTIVE_OK=$((CONSECUTIVE_OK + 1))
  if [[ "${ACTIVE}" == "1" && "${CONSECUTIVE_OK}" -ge "${RECOVERY_OK_CHECKS}" ]]; then
    if [[ -n "${ISSUE_NUMBER}" ]]; then
      log "回復確定（${CONSECUTIVE_OK} 回連続 OK）-> Issue #${ISSUE_NUMBER} をクローズ"
    else
      log "回復確定（${CONSECUTIVE_OK} 回連続 OK）"
    fi
    if [[ "${DRY_RUN}" != "1" && -n "${ISSUE_NUMBER}" ]]; then
      gh issue close "${ISSUE_NUMBER}" -R "${REPO}" \
        --comment "✅ **回復検知（${now}）**: ${FAILURE_COUNT} 回の失敗後に全チェックが正常へ復帰しました。$(printf '%s\n' '' '```' "${results[@]}" '```')" \
        || log "WARN: Issue クローズに失敗（gh 認証・ネットワークを確認）"
    fi
    ACTIVE=0
    ISSUE_NUMBER=""
    FIRST_SEEN=""
    LAST_COMMENT_AT=""
    FAILURE_COUNT=0
    CONSECUTIVE_OK=0
  elif [[ "${ACTIVE}" == "1" ]]; then
    log "回復確認中（${CONSECUTIVE_OK}/${RECOVERY_OK_CHECKS} 回連続 OK）。Issue #${ISSUE_NUMBER} は未クローズ"
  else
    log "ALL OK (${now})"
  fi
  save_state
  exit 0
fi

# --- 異常時: インシデント集約 ---
log "FAILURES=${#failures[@]} (${now})"
ACTIVE=1
CONSECUTIVE_OK=0
FAILURE_COUNT=$((FAILURE_COUNT + 1))
[[ -z "${FIRST_SEEN}" ]] && FIRST_SEEN="${now}"

if [[ "${DRY_RUN}" == "1" ]]; then
  log "dry-run: Issue 起票/コメントはスキップ（累積失敗回数=${FAILURE_COUNT}）"
  save_state
  exit 1
fi

detail="$(issue_body "検知内容")"

# 既存 open Issue を優先（state の番号 → ラベル検索の順）。
open_issue=""
if [[ -n "${ISSUE_NUMBER}" ]]; then
  st="$(gh issue view "${ISSUE_NUMBER}" -R "${REPO}" --json state --jq '.state' 2>/dev/null || true)"
  [[ "${st}" == "OPEN" ]] && open_issue="${ISSUE_NUMBER}"
fi
if [[ -z "${open_issue}" ]]; then
  open_issue="$(find_open_issue)"
fi

if [[ -n "${open_issue}" ]]; then
  ISSUE_NUMBER="${open_issue}"
  if [[ -z "${LAST_COMMENT_AT}" ]] || (( epoch - LAST_COMMENT_AT >= COMMENT_INTERVAL )); then
    log "既存 Issue #${open_issue} へ追記"
    gh issue comment "${open_issue}" -R "${REPO}" --body "🚨 **継続異常** ${detail}" \
      || { log "ERROR: Issue コメントに失敗"; save_state; exit 1; }
    LAST_COMMENT_AT="${epoch}"
  else
    remaining=$((COMMENT_INTERVAL - (epoch - LAST_COMMENT_AT)))
    log "SUPPRESSED: 継続異常コメントを抑制（次回更新まで約 ${remaining}s）"
  fi
else
  log "新規 Issue を起票"
  gh label create "${LABEL}" -R "${REPO}" \
    --description "ocsrc-watchdog による自動検知" --color D93F0B 2>/dev/null || true
  new_issue="$(gh issue create -R "${REPO}" --label "${LABEL}" \
    --title "[watchdog] 本番ヘルスチェック異常検知（${now}）" \
    --body "🚨 ${detail}" 2>/dev/null || true)"
  if [[ -z "${new_issue}" ]]; then
    log "ERROR: Issue 起票に失敗（gh 認証・ネットワークを確認）"
    save_state
    exit 1
  fi
  ISSUE_NUMBER="${new_issue}"
  LAST_COMMENT_AT="${epoch}"
fi

save_state
exit 1

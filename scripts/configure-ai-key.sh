#!/usr/bin/env bash
# OCSRC AI ブローカー用の Anthropic API キーをサーバー側に設定する。
#
# 安全性:
#   - キーは `read -s` で入力し、画面・journal・リポジトリには出力しない
#   - /etc/ocsrc/api.env を root:root 600 で原子的に更新（既存行は置換）
#   - 設定後は /api/v1/ai/status の configured:true のみを確認（キーは表示しない）
#
# 使い方:
#   sudo scripts/configure-ai-key.sh            # キー入力を促し、設定して API を再起動
#   sudo scripts/configure-ai-key.sh --test     # 設定後に最小の生成テストも実行
#
# 環境変数:
#   OCSRC_API_ENV_FILE    API 環境ファイル（既定 /etc/ocsrc/api.env）
set -euo pipefail

ENV_FILE="${OCSRC_API_ENV_FILE:-/etc/ocsrc/api.env}"
TEST_MODE="${1:-}"

if [[ "$(id -u)" != "0" ]]; then
  echo "[configure-ai-key] ERROR: sudo で実行してください" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[configure-ai-key] ERROR: ${ENV_FILE} がありません" >&2
  exit 1
fi

echo -n "[configure-ai-key] Anthropic API キーを入力（入力は非表示）: " >&2
IFS= read -r -s KEY
echo >&2
if [[ -z "${KEY}" ]]; then
  echo "[configure-ai-key] ERROR: キーが空です" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f "${tmp}"' EXIT
# 既存の OCSRC_ANTHROPIC_API_KEY 行を置換し、他の設定を保持する。
grep -v '^OCSRC_ANTHROPIC_API_KEY=' "${ENV_FILE}" > "${tmp}" || true
printf 'OCSRC_ANTHROPIC_API_KEY=%s\n' "${KEY}" >> "${tmp}"
install -m 600 -o root -g root "${tmp}" "${ENV_FILE}"

systemctl restart ocsrc-api
sleep 2

status="$(curl -s -m 10 http://127.0.0.1:8000/api/v1/ai/status || true)"
echo "[configure-ai-key] status: ${status}"
if [[ "${status}" != *'"configured":true'* ]]; then
  echo "[configure-ai-key] ERROR: configured:true を確認できません" >&2
  exit 1
fi

if [[ "${TEST_MODE}" == "--test" ]]; then
  echo "[configure-ai-key] 最小の生成テストを実行します（課金が発生します）..."
  res="$(curl -s -m 120 -X POST http://127.0.0.1:8000/api/v1/ai/memo \
    -H 'content-type: application/json' \
    -d '{"prompt":"OCSRC 接続テストです。1文で「テスト成功」とだけ答えてください。"}' || true)"
  echo "[configure-ai-key] result: ${res:0:200}"
  [[ "${res}" == *'"ok":true'* ]] || { echo "[configure-ai-key] ERROR: 生成テスト失敗" >&2; exit 1; }
fi

echo "[configure-ai-key] 設定完了（キーは表示しません）"

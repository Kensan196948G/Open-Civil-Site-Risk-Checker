#!/usr/bin/env bash
# ocsrc-web の起動前ガード（ExecStartPre から冪等に呼ばれる想定）。
#
# 目的: リポジトリ再取得/リセットで gitignore 対象の node_modules / dist が消えても、
#       サービス起動時に自動再生成し「静かに 500 を返し続ける」事故を防ぐ（Issue #79）。
#
# 冪等性: 欠落しているものだけを再生成する。
#   - node_modules 欠落        -> npm ci（失敗時 npm install にフォールバック）
#   - dist/index.html 欠落     -> npm run build
# いずれも揃っていれば存在チェックだけの高速 no-op（通常の restart はここを素通り）。
#
# PATH: systemd の最小環境でも npm を解決できるよう、unit 側で
#       Environment=PATH=<node_dir>:... を設定する（install-systemd.sh が付与）。
#       手動実行や PATH 不備に備え、OCSRC_NODE_DIR / nvm 既定 / command -v で補完する。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${PROJECT_DIR}/frontend"

# --- npm/node の解決（PATH に無ければ補完） ---
if ! command -v npm >/dev/null 2>&1; then
  for d in "${OCSRC_NODE_DIR:-}" "$(command -v node 2>/dev/null | xargs -r dirname)"; do
    [[ -n "${d}" && -x "${d}/npm" ]] && export PATH="${d}:${PATH}" && break
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[ensure-web-build] ERROR: npm が見つかりません（PATH / OCSRC_NODE_DIR を確認）。" >&2
  exit 1
fi

cd "${FRONTEND_DIR}"

# --- 依存 ---
if [[ ! -x node_modules/.bin/vite ]]; then
  echo "[ensure-web-build] node_modules 欠落/不完全 -> 依存を再インストール"
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  echo "[ensure-web-build] node_modules OK"
fi

# --- ビルド成果物 ---
if [[ ! -f dist/index.html ]]; then
  echo "[ensure-web-build] dist/index.html 欠落 -> ビルド再生成"
  npm run build
else
  echo "[ensure-web-build] dist/index.html OK"
fi

echo "[ensure-web-build] 起動前ガード完了"

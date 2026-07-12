#!/usr/bin/env bash
# ocsrc-api の起動前ガード（ExecStartPre から冪等に呼ばれる想定）。
#
# 目的: リポジトリ再取得/リセットで gitignore 対象の backend/.venv が消えても、
#       サービス起動時に自動再生成する（Issue #86、Issue #79 のバックエンド版）。
#       .venv 消失後も稼働中の uvicorn プロセスは動作を継続できてしまい症状が
#       表面化しないため、次に systemctl restart した瞬間 execve 失敗
#       （status=203/EXEC）でクラッシュループに陥る、という事故が実際に発生した。
#
# 冪等性: .venv/bin/uvicorn が揃っていれば存在チェックだけの高速 no-op。
#         欠落時のみ venv 再構築 + pip install -r requirements.txt を行う。
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${PROJECT_DIR}/backend"

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ensure-api-venv] ERROR: python3 が見つかりません（PATH を確認）。" >&2
  exit 1
fi

cd "${BACKEND_DIR}"

if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "[ensure-api-venv] .venv/bin/uvicorn 欠落 -> venv を再構築"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --disable-pip-version-check --upgrade pip
  .venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt
else
  echo "[ensure-api-venv] .venv OK"
fi

echo "[ensure-api-venv] 起動前ガード完了"

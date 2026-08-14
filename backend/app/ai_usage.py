"""AI 利用実績の DB 永続化と集計（評価書 #20・AI 利用量/費用ダッシュボード）。

設計方針:
- additive migration（CREATE TABLE IF NOT EXISTS）で既存テーブルに非干渉
  （cases.py / data_sources.py と同じ方式）。
- 記録は best-effort。DB 未設定・未到達でも AI メモ生成フローを失敗させない。
- プロンプト本文は記録しない（監査方針と同じ）。文字数・モデル・状態・所要時間のみ。
- 費用は概算（トークン ≈ 文字数/4 の近似・入力/出力別単価は定数で管理）。
  表示側で「概算」であることを明記する。
"""

from __future__ import annotations

from typing import Any

AI_USAGE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    prompt_chars INTEGER NOT NULL DEFAULT 0,
    completion_chars INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    warnings INTEGER
);
CREATE INDEX IF NOT EXISTS ai_usage_ts_ix ON ai_usage (ts DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_ix ON ai_usage (user_id);
"""

# 概算単価（USD / 100 万トークン）。実際の契約・モデルに応じて要調整（表示は「概算」）。
EST_INPUT_USD_PER_1M_TOKENS = 3.0
EST_OUTPUT_USD_PER_1M_TOKENS = 15.0
# 日本語中心の近似: 1 トークン ≈ 4 文字。
CHARS_PER_TOKEN = 4.0

USAGE_NOTE = (
    "サーバー側 DB（ai_usage テーブル）に記録された実績のみです。"
    "プロンプト本文は記録しません。費用は概算（トークン≈文字数/4・入力/出力別単価）です。"
)


async def ensure_ai_usage_schema(conn: Any) -> None:
    """テーブル作成（冪等）。"""
    await conn.execute(AI_USAGE_SCHEMA_SQL)


async def record_ai_usage(
    conn: Any,
    *,
    user_id: str,
    model: str,
    status: str,
    status_code: int,
    prompt_chars: int,
    completion_chars: int = 0,
    duration_ms: int | None = None,
    warnings: int | None = None,
) -> None:
    """AI 呼び出し 1 件を追記する。プロンプト本文は含めない。"""
    await conn.execute(
        """
        INSERT INTO ai_usage
            (user_id, model, status, status_code, prompt_chars, completion_chars,
             duration_ms, warnings)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """,
        user_id[:128],
        model[:128],
        status[:64],
        status_code,
        prompt_chars,
        completion_chars,
        duration_ms,
        warnings,
    )


def estimate_cost_usd(prompt_chars: int, completion_chars: int) -> float:
    """概算費用（USD）。トークン ≈ 文字数/4 の近似（表示側で「概算」明記）。"""
    input_tokens = prompt_chars / CHARS_PER_TOKEN
    output_tokens = completion_chars / CHARS_PER_TOKEN
    return round(
        input_tokens / 1_000_000 * EST_INPUT_USD_PER_1M_TOKENS
        + output_tokens / 1_000_000 * EST_OUTPUT_USD_PER_1M_TOKENS,
        4,
    )


async def summarize_ai_usage(conn: Any, *, days: int = 30) -> dict:
    """直近 days 日の利用実績サマリー（合計・日別・ユーザー別・概算費用）。

    「該当なし」と「取得失敗」の区別（NFR-504）のため、集計が 0 件でも
    status=ok の空サマリーを返す（テーブル未整備・DB 未到達は呼び出し側で 503）。
    """
    totals = await conn.fetchrow(
        """
        SELECT count(*) AS calls,
               count(*) FILTER (WHERE status = 'ok') AS ok_calls,
               count(*) FILTER (WHERE status <> 'ok') AS error_calls,
               coalesce(sum(prompt_chars), 0) AS prompt_chars,
               coalesce(sum(completion_chars), 0) AS completion_chars,
               coalesce(sum(duration_ms), 0) AS duration_ms,
               coalesce(sum(warnings), 0) AS warnings
        FROM ai_usage
        WHERE ts >= now() - make_interval(days => $1)
        """,
        days,
    )
    daily = await conn.fetch(
        """
        SELECT to_char(ts AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') AS date,
               count(*) AS calls,
               count(*) FILTER (WHERE status = 'ok') AS ok_calls,
               count(*) FILTER (WHERE status <> 'ok') AS error_calls,
               coalesce(sum(prompt_chars), 0) AS prompt_chars,
               coalesce(sum(completion_chars), 0) AS completion_chars
        FROM ai_usage
        WHERE ts >= now() - make_interval(days => $1)
        GROUP BY date
        ORDER BY date DESC
        """,
        days,
    )
    users = await conn.fetch(
        """
        SELECT user_id AS user,
               count(*) AS calls,
               count(*) FILTER (WHERE status = 'ok') AS ok_calls,
               coalesce(sum(prompt_chars), 0) AS prompt_chars,
               coalesce(sum(completion_chars), 0) AS completion_chars
        FROM ai_usage
        WHERE ts >= now() - make_interval(days => $1)
        GROUP BY user_id
        ORDER BY calls DESC, user_id ASC
        LIMIT 50
        """,
        days,
    )
    prompt_chars = int(totals["prompt_chars"] or 0)
    completion_chars = int(totals["completion_chars"] or 0)
    return {
        "status": "ok",
        "days": days,
        "total": {
            "calls": int(totals["calls"] or 0),
            "ok_calls": int(totals["ok_calls"] or 0),
            "error_calls": int(totals["error_calls"] or 0),
            "prompt_chars": prompt_chars,
            "completion_chars": completion_chars,
            "duration_ms": int(totals["duration_ms"] or 0),
            "warnings": int(totals["warnings"] or 0),
            "estimated_cost_usd": estimate_cost_usd(prompt_chars, completion_chars),
        },
        "daily": [
            {
                "date": str(r["date"]),
                "calls": int(r["calls"] or 0),
                "ok_calls": int(r["ok_calls"] or 0),
                "error_calls": int(r["error_calls"] or 0),
                "prompt_chars": int(r["prompt_chars"] or 0),
                "completion_chars": int(r["completion_chars"] or 0),
            }
            for r in daily
        ],
        "users": [
            {
                "user": str(r["user"]),
                "calls": int(r["calls"] or 0),
                "ok_calls": int(r["ok_calls"] or 0),
                "prompt_chars": int(r["prompt_chars"] or 0),
                "completion_chars": int(r["completion_chars"] or 0),
            }
            for r in users
        ],
        "note": USAGE_NOTE,
    }

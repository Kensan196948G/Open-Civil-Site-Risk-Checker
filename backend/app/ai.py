"""Server-side AI broker for the investigation memo (Anthropic).

The browser never holds or transmits an Anthropic API key. It calls our
backend, which keeps the key in ``OCSRC_ANTHROPIC_API_KEY`` (server env only)
and forwards a validated prompt to Anthropic Messages API.
"""

from __future__ import annotations

import httpx
from pydantic import BaseModel, Field

from .settings import Settings


class AiMemoRequest(BaseModel):
    """Prompt payload from the browser (untrusted input, validated server-side)."""

    prompt: str = Field(min_length=1, max_length=20_000)


class AiUpstreamError(Exception):
    """Anthropic upstream failure with a safe (secret-free) message."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


async def call_anthropic(settings: Settings, prompt: str) -> str:
    """Forward one prompt to Anthropic Messages API and return the text.

    Raises AiUpstreamError for non-200 responses. The API key is only read
    from server settings and never included in exceptions or logs.
    """
    if not settings.anthropic_api_key:
        raise AiUpstreamError(503, "AI はサーバー側で未設定です（OCSRC_ANTHROPIC_API_KEY）")

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": settings.anthropic_model,
        "max_tokens": 3000,
        "messages": [{"role": "user", "content": prompt}],
    }
    try:
        async with httpx.AsyncClient(timeout=settings.anthropic_timeout_seconds) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        reason = type(exc).__name__
        raise AiUpstreamError(502, f"Anthropic API に到達できません（{reason}）") from exc

    if resp.status_code in (401, 403):
        raise AiUpstreamError(401, "認証失敗（サーバー側 API キーを確認してください）")
    if resp.status_code == 429:
        raise AiUpstreamError(429, "レート制限（時間をおいて再試行してください）")
    if resp.status_code != 200:
        raise AiUpstreamError(502, f"Anthropic API エラー（HTTP {resp.status_code}）")

    data = resp.json()
    blocks = data.get("content") or []
    text = "".join(
        block.get("text", "")
        for block in blocks
        if isinstance(block, dict) and block.get("type") == "text"
    ).strip()
    if not text:
        raise AiUpstreamError(502, "Anthropic 応答にテキストが含まれていません")
    return text

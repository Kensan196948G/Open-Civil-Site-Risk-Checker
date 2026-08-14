"""AI broker endpoint tests (server-side key, no browser-side secret)."""

import asyncio

from fastapi.testclient import TestClient

from app.ai import AiUpstreamError
from app.main import create_app
from app.settings import Settings, get_settings


def make_client(**overrides) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, **overrides
    )
    return TestClient(app)


def test_ai_status_reports_unconfigured_without_key() -> None:
    client = make_client(anthropic_api_key=None)
    res = client.get("/api/v1/ai/status")
    assert res.status_code == 200
    assert res.json() == {"configured": False, "model": "claude-sonnet-5"}


def test_ai_status_does_not_expose_key() -> None:
    client = make_client(anthropic_api_key="sk-ant-secret-value")
    res = client.get("/api/v1/ai/status")
    body = res.json()
    assert body["configured"] is True
    assert "sk-ant" not in res.text


def test_ai_memo_without_key_returns_503() -> None:
    client = make_client(anthropic_api_key=None)
    res = client.post("/api/v1/ai/memo", json={"prompt": "テスト"})
    assert res.status_code == 503
    assert res.json()["ok"] is False
    assert "未設定" in res.json()["error"]


def test_ai_memo_rejects_empty_or_oversized_prompt() -> None:
    client = make_client(anthropic_api_key="sk-ant-test")
    assert client.post("/api/v1/ai/memo", json={"prompt": ""}).status_code == 422
    assert (
        client.post("/api/v1/ai/memo", json={"prompt": "x" * 20_001}).status_code == 422
    )


def test_ai_memo_forwards_prompt_and_returns_text(monkeypatch) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        assert settings.anthropic_api_key == "sk-ant-test"
        assert prompt == "PROMPT"
        return "生成されたメモ"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(anthropic_api_key="sk-ant-test")
    res = client.post("/api/v1/ai/memo", json={"prompt": "PROMPT"})
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["model"] == "claude-sonnet-5"
    assert body["warnings"] == []
    # サーバー側でも免責文の必須化を保証する（直接 API 呼び出しへの多層防御）。
    assert "断定するものではありません" in body["text"]


def test_ai_memo_maps_upstream_error_without_secret(monkeypatch) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        raise AiUpstreamError(429, "レート制限（時間をおいて再試行してください）")

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(anthropic_api_key="sk-ant-test")
    res = client.post("/api/v1/ai/memo", json={"prompt": "PROMPT"})
    assert res.status_code == 429
    assert "sk-ant" not in res.text


def test_ai_memo_rate_limits_excess_calls(monkeypatch) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        return "memo"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(
        anthropic_api_key="sk-ant-test",
        anthropic_rate_limit_per_window=2,
    )
    assert client.post("/api/v1/ai/memo", json={"prompt": "a"}).status_code == 200
    assert client.post("/api/v1/ai/memo", json={"prompt": "b"}).status_code == 200
    res = client.post("/api/v1/ai/memo", json={"prompt": "c"})
    assert res.status_code == 429
    assert "上限" in res.json()["error"]


def test_ai_memo_rejects_when_concurrency_full(monkeypatch) -> None:
    from app import main as main_module

    async def slow_call(settings, prompt: str) -> str:
        return "memo"

    monkeypatch.setattr(main_module, "call_anthropic", slow_call)
    app = create_app(
        settings=Settings(
            _env_file=None,
            anthropic_api_key="sk-ant-test",
            anthropic_max_concurrency=1,
            anthropic_rate_limit_per_window=100,
        )
    )
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        anthropic_api_key="sk-ant-test",
        anthropic_max_concurrency=1,
        anthropic_rate_limit_per_window=100,
    )
    # 同時実行上限を占有した状態を再現し、429 で即拒否されることを検証する。
    # （CI は pytest-asyncio 非搭載のため、Semaphore.locked を差し替える同期方式）
    monkeypatch.setattr(asyncio.Semaphore, "locked", lambda self: True)
    client = TestClient(app)
    res = client.post("/api/v1/ai/memo", json={"prompt": "x"})

    assert res.status_code == 429
    assert "同時実行数" in res.json()["error"]


def test_ai_memo_returns_warnings_for_definitive_text(monkeypatch) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        return "この地点は安全です。"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(anthropic_api_key="sk-ant-test")
    res = client.post("/api/v1/ai/memo", json={"prompt": "PROMPT"})
    assert res.status_code == 200
    body = res.json()
    assert body["warnings"] == ["安全です"]


def test_call_anthropic_sends_system_prompt(monkeypatch) -> None:
    from app import ai as ai_module

    captured = {}

    class _FakeResponse:
        status_code = 200

        def json(self):
            return {"content": [{"type": "text", "text": "ok"}]}

    class _FakeClient:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _FakeResponse()

    monkeypatch.setattr(ai_module.httpx, "AsyncClient", _FakeClient)

    import asyncio

    text = asyncio.run(
        ai_module.call_anthropic(
            Settings(_env_file=None, anthropic_api_key="sk-ant-test"),
            "PROMPT",
        )
    )
    assert text == "ok"
    assert captured["json"]["system"] == ai_module.SYSTEM_PROMPT
    assert captured["json"]["messages"] == [{"role": "user", "content": "PROMPT"}]
    assert captured["headers"]["x-api-key"] == "sk-ant-test"


def test_ai_memo_audit_logs_user_and_prompt_size_without_content(
    monkeypatch, caplog
) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        return "生成されたメモ"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(anthropic_api_key="sk-ant-test")
    with caplog.at_level("INFO", logger="ocsrc.api"):
        res = client.post(
            "/api/v1/ai/memo",
            json={"prompt": "PROMPT"},
            headers={"x-ocsrc-user": "taro@example.com"},
        )
    assert res.status_code == 200
    assert "ai_audit" in caplog.text
    assert "taro@example.com" in caplog.text
    assert '"prompt_chars": 6' in caplog.text
    assert '"status": "ok"' in caplog.text
    # 監査ログにプロンプト本文・API キーを出力しない。
    assert "PROMPT" not in caplog.text
    assert "sk-ant" not in caplog.text


def test_ai_memo_audit_anonymous_when_header_absent(monkeypatch, caplog) -> None:
    from app import main as main_module

    async def fake_call(settings, prompt: str) -> str:
        return "生成されたメモ"

    monkeypatch.setattr(main_module, "call_anthropic", fake_call)
    client = make_client(anthropic_api_key="sk-ant-test")
    with caplog.at_level("INFO", logger="ocsrc.api"):
        client.post("/api/v1/ai/memo", json={"prompt": "PROMPT"})
    assert '"user": "anonymous"' in caplog.text


def test_ensure_disclaimer_appends_when_missing() -> None:
    from app.ai import ensure_disclaimer

    text = ensure_disclaimer("メモ本文")
    assert "## 注意事項" in text
    assert "断定するものではありません" in text
    # 既存の免責文は二重付加しない。
    assert ensure_disclaimer(text) == text


def test_find_forbidden_expressions_detects_definitive_words() -> None:
    from app.ai import find_forbidden_expressions

    assert find_forbidden_expressions("この地点は安全です") == ["安全です"]
    assert find_forbidden_expressions("要確認です") == []

"""CORS opt-in behaviour (Issue #32).

Production is same-origin behind the reverse proxy (Issue #35); CORS exists
only as an explicit allowlist for browser dev clients such as vite on
http://localhost:5173. Unset OCSRC_CORS_ORIGINS must leave responses
byte-identical to the pre-CORS behaviour (no CORS headers at all).
"""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings, get_settings

DEV_ORIGIN = "http://localhost:5173"


def make_client(**overrides) -> TestClient:
    """Build a client whose settings are fully controlled by the test."""
    settings = Settings(_env_file=None, **overrides)
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_allowed_origin_gets_cors_header() -> None:
    client = make_client(cors_origins=DEV_ORIGIN)
    res = client.get("/api/v1/ping", headers={"Origin": DEV_ORIGIN})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == DEV_ORIGIN


def test_preflight_allows_get_for_allowed_origin() -> None:
    client = make_client(cors_origins=DEV_ORIGIN)
    res = client.options(
        "/api/v1/ping",
        headers={"Origin": DEV_ORIGIN, "Access-Control-Request-Method": "GET"},
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == DEV_ORIGIN
    assert "GET" in res.headers.get("access-control-allow-methods", "")
    # allow_credentials=False: the credentials header must never be emitted.
    assert "access-control-allow-credentials" not in res.headers


def test_disallowed_origin_gets_no_cors_header() -> None:
    client = make_client(cors_origins=DEV_ORIGIN)
    res = client.get("/api/v1/ping", headers={"Origin": "http://evil.example.com"})
    # The response itself still succeeds; the browser blocks it client-side
    # because no Access-Control-Allow-Origin is present.
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers


def test_preflight_from_disallowed_origin_is_rejected() -> None:
    client = make_client(cors_origins=DEV_ORIGIN)
    res = client.options(
        "/api/v1/ping",
        headers={
            "Origin": "http://evil.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    # Starlette rejects the preflight for a disallowed origin outright; crucially
    # it never emits an Access-Control-Allow-Origin the browser could act on.
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


def test_trailing_slash_origin_still_matches_browser_origin() -> None:
    # Configuring the origin with a trailing slash must still allow the browser
    # Origin (which carries no path). This is the silent foot-gun that the
    # rstrip("/") normalization in cors_origin_list removes.
    client = make_client(cors_origins="http://localhost:5173/")
    res = client.get("/api/v1/ping", headers={"Origin": DEV_ORIGIN})
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == DEV_ORIGIN


def test_unset_cors_origins_keeps_legacy_behavior() -> None:
    client = make_client()  # cors_origins defaults to "" (unset)
    res = client.get("/api/v1/ping", headers={"Origin": DEV_ORIGIN})
    assert res.status_code == 200
    assert "access-control-allow-origin" not in res.headers


def test_wildcard_origin_is_rejected_at_startup() -> None:
    with pytest.raises(ValueError, match="wildcard"):
        create_app(Settings(_env_file=None, cors_origins="*"))


def test_wildcard_mixed_with_explicit_origins_is_rejected() -> None:
    with pytest.raises(ValueError, match="wildcard"):
        create_app(Settings(_env_file=None, cors_origins=f"{DEV_ORIGIN},*"))


def test_cors_origins_parsing_strips_and_drops_empties() -> None:
    settings = Settings(
        _env_file=None, cors_origins=" http://a.example , ,http://b.example,"
    )
    assert settings.cors_origin_list == ["http://a.example", "http://b.example"]


def test_cors_origins_parsing_normalizes_trailing_slash() -> None:
    settings = Settings(
        _env_file=None, cors_origins="http://localhost:5173/, http://a.example//, /"
    )
    # Trailing slashes are stripped; a lone "/" normalizes to empty and is dropped.
    assert settings.cors_origin_list == ["http://localhost:5173", "http://a.example"]


def test_env_var_feeds_cors_origins(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCSRC_CORS_ORIGINS", DEV_ORIGIN)
    settings = Settings(_env_file=None)
    assert settings.cors_origin_list == [DEV_ORIGIN]

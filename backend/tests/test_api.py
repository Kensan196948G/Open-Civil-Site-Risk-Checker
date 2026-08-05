from fastapi.testclient import TestClient

from app.main import API_VERSION, create_app
from app.settings import Settings, get_settings


def make_client(**overrides) -> TestClient:
    """Build a client whose settings are fully controlled by the test."""
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, **overrides
    )
    return TestClient(app)


def test_ping_returns_pong_and_env() -> None:
    client = make_client(app_env="test")
    res = client.get("/api/v1/ping")
    assert res.status_code == 200
    assert res.json() == {"ping": "pong", "env": "test"}


def test_livez_does_not_depend_on_database() -> None:
    client = make_client(database_url=None)
    res = client.get("/livez")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["version"] == API_VERSION


def test_readyz_without_database_returns_503_not_configured() -> None:
    client = make_client(database_url=None)
    res = client.get("/readyz")
    assert res.status_code == 503
    body = res.json()
    detail = body["detail"]
    assert detail["status"] == "error"
    assert detail["db"] == "not_configured"
    assert detail["version"] == API_VERSION


def test_readyz_with_unreachable_database_returns_503() -> None:
    # Port 9 (discard) is practically never a PostgreSQL server; the check
    # must degrade to 'error' (or 'unavailable' without asyncpg), not raise.
    client = make_client(
        database_url="postgresql://app:wrong@127.0.0.1:9/nodb",
        db_check_timeout_seconds=1.5,
    )
    res = client.get("/readyz")
    assert res.status_code == 503
    assert res.json()["detail"]["db"] in ("error", "unavailable")
    assert res.json()["detail"]["db_error"] in ("connect", "unknown", "timeout")


def test_healthz_is_legacy_alias_of_readyz() -> None:
    client = make_client(database_url=None)
    res = client.get("/healthz")
    assert res.status_code == 503
    assert res.json()["detail"]["db"] == "not_configured"

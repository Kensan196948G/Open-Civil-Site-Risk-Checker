"""Nominatim proxy endpoints (Issue #84).

Nominatim itself is never called in tests: httpx.AsyncClient is replaced
with a fake so these stay hermetic and fast, mirroring how test_nearby_api.py
avoids a real PostGIS connection.
"""

import asyncio
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from app import geocode as geocode_module
from app.main import create_app
from app.settings import Settings, get_settings


class _FakeResponse:
    def __init__(self, status_code: int, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


def _fake_async_client(get_impl):
    """Build a fake replacement for httpx.AsyncClient bound to get_impl."""

    class _Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def get(self, url, params=None, headers=None):
            return await get_impl(url, params=params, headers=headers)

    return _Client


def make_client() -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, nominatim_min_interval_seconds=0.0
    )
    return TestClient(app)


def test_geocode_returns_upstream_items(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        assert url.endswith("/search")
        assert headers["User-Agent"]  # policy requires an identifying UA
        return _FakeResponse(
            200, [{"lat": "35.67", "lon": "139.75", "display_name": "霞が関, 千代田区"}]
        )

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/geocode", params={"q": "test"})
    assert res.status_code == 200
    assert res.json() == [{"lat": "35.67", "lon": "139.75", "display_name": "霞が関, 千代田区"}]


def test_geocode_empty_result_is_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        return _FakeResponse(200, [])

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/geocode", params={"q": "no-such-place"})
    assert res.status_code == 200
    assert res.json() == []


def test_geocode_upstream_failure_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/geocode", params={"q": "test"})
    assert res.status_code == 503


def test_geocode_upstream_non_200_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        return _FakeResponse(429, {"error": "rate limited"})

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/geocode", params={"q": "test"})
    assert res.status_code == 503


def test_geocode_requires_query_param() -> None:
    client = make_client()
    res = client.get("/api/v1/geocode")
    assert res.status_code == 422


def test_reverse_geocode_returns_upstream_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        assert url.endswith("/reverse")
        return _FakeResponse(200, {"address": {"province": "東京都"}})

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/reverse-geocode", params={"lat": 35.67, "lon": 139.75})
    assert res.status_code == 200
    assert res.json() == {"address": {"province": "東京都"}}


def test_reverse_geocode_validates_coordinates() -> None:
    client = make_client()
    res_lat = client.get("/api/v1/reverse-geocode", params={"lat": 95, "lon": 139.75})
    assert res_lat.status_code == 422
    res_lon = client.get("/api/v1/reverse-geocode", params={"lat": 35.67, "lon": 999})
    assert res_lon.status_code == 422


def test_reverse_geocode_upstream_failure_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_get(url, params=None, headers=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(geocode_module.httpx, "AsyncClient", _fake_async_client(fake_get))
    client = make_client()
    res = client.get("/api/v1/reverse-geocode", params={"lat": 35.67, "lon": 139.75})
    assert res.status_code == 503


def test_throttle_enforces_minimum_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    # Nominatim's usage policy caps this backend process at 1 req/sec;
    # a second call within the window must block for the remainder.
    monkeypatch.setattr(geocode_module, "_last_request_monotonic", None)

    async def run() -> float:
        start = time.monotonic()
        await geocode_module._throttle(0.1)
        await geocode_module._throttle(0.1)
        return time.monotonic() - start

    elapsed = asyncio.run(run())
    assert elapsed >= 0.1


def test_throttle_does_not_wait_after_interval_elapses(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(geocode_module, "_last_request_monotonic", time.monotonic() - 10)

    async def run() -> float:
        start = time.monotonic()
        await geocode_module._throttle(0.1)
        return time.monotonic() - start

    elapsed = asyncio.run(run())
    assert elapsed < 0.05

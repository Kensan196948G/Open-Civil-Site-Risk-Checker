from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings, get_settings


def make_client(**overrides) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, **overrides)
    return TestClient(app)


def test_nearby_validates_coordinates() -> None:
    client = make_client()
    assert client.get("/api/v1/nearby", params={"lat": 95, "lon": 139.75}).status_code == 422
    assert client.get("/api/v1/nearby", params={"lat": 35.67, "lon": 999}).status_code == 422
    assert (
        client.get(
            "/api/v1/nearby", params={"lat": 35.67, "lon": 139.75, "radius_m": 99999}
        ).status_code
        == 422
    )


def test_nearby_without_database_returns_503() -> None:
    # 'fetch failed' must be distinguishable from 'no data' (FR-304/NFR-504):
    # an unconfigured store is a 503, never an empty 200.
    client = make_client(database_url=None)
    res = client.get("/api/v1/nearby", params={"lat": 35.67, "lon": 139.75})
    assert res.status_code == 503

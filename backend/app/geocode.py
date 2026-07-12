"""Nominatim (OpenStreetMap) geocoding proxy (Issue #84).

The backend calls Nominatim server-to-server instead of the browser calling
it directly. This sidesteps a CDN cache quirk on Nominatim's side: its Vary
header omits Origin, so a response cached without an Origin header (e.g. a
bare curl request made while debugging) gets replayed verbatim to later
browser fetches — which then fail CORS because the cached response carries
no Access-Control-Allow-Origin. Routing through this backend also lets the
process enforce Nominatim's 1 req/sec usage policy
(https://operations.osmfoundation.org/policies/nominatim/) once globally,
instead of relying on each browser tab to self-throttle.
"""

import asyncio
import time

import httpx

from .settings import Settings

# Process-wide throttle state: one pair of globals is correct here because
# the policy limit is per-IP (this backend process), not per-request.
_last_request_monotonic: float | None = None
_rate_limit_lock = asyncio.Lock()


class GeocodeUnavailableError(Exception):
    """The upstream Nominatim request failed (timeout, network, non-2xx)."""


async def _throttle(min_interval_seconds: float) -> None:
    global _last_request_monotonic
    async with _rate_limit_lock:
        now = time.monotonic()
        if _last_request_monotonic is not None:
            wait = min_interval_seconds - (now - _last_request_monotonic)
            if wait > 0:
                await asyncio.sleep(wait)
        _last_request_monotonic = time.monotonic()


async def _get(path: str, params: dict[str, str], settings: Settings):
    await _throttle(settings.nominatim_min_interval_seconds)
    headers = {"User-Agent": settings.nominatim_user_agent}
    try:
        async with httpx.AsyncClient(timeout=settings.nominatim_timeout_seconds) as client:
            res = await client.get(
                f"{settings.nominatim_base_url}{path}", params=params, headers=headers
            )
    except httpx.HTTPError as exc:
        raise GeocodeUnavailableError(str(exc)) from exc
    if res.status_code != 200:
        raise GeocodeUnavailableError(f"HTTP {res.status_code}")
    return res.json()


async def search(query: str, settings: Settings) -> list[dict]:
    """Proxy a Nominatim /search call. Returns the raw item list (possibly empty)."""
    params = {
        "q": query,
        "format": "jsonv2",
        "limit": "1",
        "accept-language": "ja",
        "countrycodes": "jp",
    }
    return await _get("/search", params, settings)


async def reverse(lat: float, lon: float, settings: Settings) -> dict:
    """Proxy a Nominatim /reverse call. Returns the raw address object."""
    params = {
        "lat": str(lat),
        "lon": str(lon),
        "format": "jsonv2",
        "addressdetails": "1",
        "accept-language": "ja",
        "zoom": "5",
    }
    return await _get("/reverse", params, settings)

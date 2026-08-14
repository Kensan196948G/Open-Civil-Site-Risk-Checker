"""Database access helpers.

asyncpg is imported lazily so the API (and its tests) keep working in
environments where the driver is not installed; the health endpoint then
reports the database as unavailable instead of crashing.
"""

import asyncio
import socket
import ssl
from typing import Any

# One pool per DSN. The app normally uses a single DSN; tests may use another.
_pools: dict[str, Any] = {}


def _categorize_error(exc: BaseException) -> str:
    """Classify a DB check failure for diagnosis.

    Categories: timeout / connect / dns / ssl / auth / pool / query / unknown.
    """
    try:
        import asyncpg
    except ImportError:
        return "unknown"
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "timeout"
    if isinstance(
        exc,
        (
            asyncpg.exceptions.InvalidPasswordError,
            asyncpg.exceptions.InvalidAuthorizationSpecificationError,
        ),
    ):
        return "auth"
    if isinstance(
        exc,
        (
            asyncpg.exceptions.ConnectionDoesNotExistError,
            asyncpg.exceptions.CannotConnectNowError,
            asyncpg.exceptions.InterfaceError,
        ),
    ):
        return "pool"
    if isinstance(exc, socket.gaierror):
        return "dns"
    if isinstance(exc, ssl.SSLError):
        return "ssl"
    if isinstance(exc, OSError):
        return "connect"
    return "unknown"


async def check_database(database_url: str, timeout: float = 20.0) -> tuple[str, float, str | None]:
    """Check database reachability.

    Returns (status, check_ms, error_category):
      status: 'ok' | 'error' | 'unavailable'
      error_category: machine-readable phase of failure (None when ok).
    """
    import time

    try:
        import asyncpg
    except ImportError:
        return "unavailable", 0.0, "driver_missing"

    started = time.perf_counter()
    # 既存プールがあれば warm connection で確認（Neon cold start の誤検知を減らす）。
    pool = _pools.get(database_url)
    pool_error: str | None = None
    if pool is not None:
        try:
            async with asyncio.timeout(timeout):
                conn = await pool.acquire()
                try:
                    await conn.execute("SELECT 1")
                finally:
                    await pool.release(conn)
            return "ok", round((time.perf_counter() - started) * 1000, 1), None
        except Exception as exc:
            # プール内接続が失効している場合は新規接続で再確認（cold start 対策）。
            pool_error = _categorize_error(exc)

    try:
        async with asyncio.timeout(timeout):
            conn = await asyncpg.connect(dsn=database_url)
            try:
                await conn.execute("SELECT 1")
            finally:
                await conn.close()
        return "ok", round((time.perf_counter() - started) * 1000, 1), None
    except Exception as exc:
        # Connection refused, auth failure, timeout, bad DSN — the health
        # endpoint only needs a coarse ok/error signal, details go to logs.
        category = _categorize_error(exc)
        if pool_error is not None and category == "unknown":
            category = pool_error
        return "error", round((time.perf_counter() - started) * 1000, 1), category


async def get_pool(database_url: str):
    """Return (creating on first use) a connection pool for the DSN."""
    import asyncpg

    pool = _pools.get(database_url)
    if pool is None:
        pool = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=5)
        _pools[database_url] = pool
    return pool


async def close_pools() -> None:
    pools = list(_pools.values())
    _pools.clear()
    for pool in pools:
        await pool.close()

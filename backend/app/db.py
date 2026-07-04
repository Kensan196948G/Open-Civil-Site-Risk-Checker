"""Database access helpers.

asyncpg is imported lazily so the API (and its tests) keep working in
environments where the driver is not installed; the health endpoint then
reports the database as unavailable instead of crashing.
"""

import asyncio
from typing import Any

# One pool per DSN. The app normally uses a single DSN; tests may use another.
_pools: dict[str, Any] = {}


async def check_database(database_url: str, timeout: float = 3.0) -> str:
    """Return the database health state: 'ok', 'error' or 'unavailable'."""
    try:
        import asyncpg
    except ImportError:
        return "unavailable"

    try:
        conn = await asyncio.wait_for(asyncpg.connect(dsn=database_url), timeout=timeout)
        try:
            await conn.execute("SELECT 1")
        finally:
            await conn.close()
        return "ok"
    except Exception:
        # Connection refused, auth failure, timeout, bad DSN — the health
        # endpoint only needs a coarse ok/error signal, details go to logs.
        return "error"


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

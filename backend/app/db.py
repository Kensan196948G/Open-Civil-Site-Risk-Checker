"""Database connectivity check.

asyncpg is imported lazily so the API (and its tests) keep working in
environments where the driver is not installed; the health endpoint then
reports the database as unavailable instead of crashing.
"""

import asyncio


async def check_database(database_url: str, timeout: float = 3.0) -> str:
    """Return the database health state: 'ok', 'error' or 'unavailable'."""
    try:
        import asyncpg
    except ImportError:
        return "unavailable"

    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(dsn=database_url), timeout=timeout
        )
        try:
            await conn.execute("SELECT 1")
        finally:
            await conn.close()
        return "ok"
    except Exception:
        # Connection refused, auth failure, timeout, bad DSN — the health
        # endpoint only needs a coarse ok/error signal, details go to logs.
        return "error"

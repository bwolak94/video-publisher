"""PostgreSQL + pgvector connection for RAG source material storage."""
import asyncio

import asyncpg
import structlog

from app.config import get_settings

logger = structlog.get_logger(__name__)

_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector;"

_CREATE_SOURCES_TABLE = """
CREATE TABLE IF NOT EXISTS rag_sources (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    tenant_id    TEXT,
    filename     TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (project_id, content_hash)
);
"""

_CREATE_CHUNKS_TABLE = """
CREATE TABLE IF NOT EXISTS rag_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id   UUID NOT NULL REFERENCES rag_sources(id) ON DELETE CASCADE,
    project_id  TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_chunks_project_idx ON rag_chunks (project_id);
"""


_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    """Return the shared asyncpg connection pool, creating it on first call."""
    global _pool
    if _pool is not None:
        return _pool
    async with _pool_lock:
        if _pool is None:
            db_url = get_settings().DATABASE_URL.replace("postgres://", "postgresql://")
            _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5)
    return _pool


async def ensure_schema(pool: asyncpg.Pool) -> None:
    """Create pgvector extension and tables if they don't exist."""
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_EXTENSION)
        await conn.execute(_CREATE_SOURCES_TABLE)
        await conn.execute(_CREATE_CHUNKS_TABLE)
    logger.info("rag_schema_ready")

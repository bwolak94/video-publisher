"""PostgreSQL + pgvector connection for RAG source material storage."""
import os

import asyncpg
import structlog

logger = structlog.get_logger(__name__)

_CREATE_EXTENSION = "CREATE EXTENSION IF NOT EXISTS vector;"

_CREATE_SOURCES_TABLE = """
CREATE TABLE IF NOT EXISTS rag_sources (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  TEXT NOT NULL,
    filename    TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
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


async def get_pool() -> asyncpg.Pool:
    """Return an asyncpg connection pool. Created lazily on first call."""
    db_url = os.environ.get("DATABASE_URL", "postgresql://localhost/video_publisher")
    # asyncpg uses postgresql:// scheme
    db_url = db_url.replace("postgres://", "postgresql://")
    pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5)
    return pool


async def ensure_schema(pool: asyncpg.Pool) -> None:
    """Create pgvector extension and tables if they don't exist."""
    async with pool.acquire() as conn:
        await conn.execute(_CREATE_EXTENSION)
        await conn.execute(_CREATE_SOURCES_TABLE)
        await conn.execute(_CREATE_CHUNKS_TABLE)
    logger.info("rag_schema_ready")

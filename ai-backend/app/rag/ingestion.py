"""Source material ingestion: chunk → embed → store in pgvector."""
import math
import uuid

import asyncpg
import structlog

from app.rag.chunker import chunk_text
from app.rag.embeddings import embed_texts

logger = structlog.get_logger(__name__)


def _validate_embedding(embedding: list[float], chunk_index: int) -> list[float]:
    """I9: Guard against NaN/Inf values that would corrupt pgvector storage.

    OpenAI embeddings are always finite, but malformed model responses or
    downstream parsing errors can introduce invalid floats that pgvector
    silently stores, producing incorrect cosine-similarity results at retrieval.
    """
    for i, v in enumerate(embedding):
        if not math.isfinite(v):
            raise ValueError(
                f"Embedding for chunk {chunk_index} contains non-finite value "
                f"at position {i}: {v!r}. Aborting ingestion to prevent corrupt data."
            )
    return embedding

# OpenAI allows up to 2048 texts per request, but keep batches small
_EMBED_BATCH_SIZE = 64


async def ingest_text(
    pool: asyncpg.Pool,
    project_id: str,
    content: str,
    filename: str | None = None,
) -> str:
    """Chunk, embed, and store source material. Returns the source ID."""
    chunks = chunk_text(content)
    if not chunks:
        raise ValueError("Source content is empty after chunking")

    # Insert source record
    source_id = str(uuid.uuid4())
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO rag_sources (id, project_id, filename) VALUES ($1, $2, $3)",
            source_id, project_id, filename,
        )

    # Embed in batches; validate each vector before accumulating (I9)
    all_embeddings: list[list[float]] = []
    for i in range(0, len(chunks), _EMBED_BATCH_SIZE):
        batch = chunks[i : i + _EMBED_BATCH_SIZE]
        embeddings = await embed_texts(batch)
        for local_idx, emb in enumerate(embeddings):
            _validate_embedding(emb, i + local_idx)
        all_embeddings.extend(embeddings)

    # Store chunks with embeddings
    async with pool.acquire() as conn:
        rows = [
            (
                str(uuid.uuid4()),
                source_id,
                project_id,
                idx,
                chunk,
                f"[{','.join(str(v) for v in embedding)}]",  # pgvector literal format
            )
            for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings))
        ]
        await conn.executemany(
            """INSERT INTO rag_chunks (id, source_id, project_id, chunk_index, content, embedding)
               VALUES ($1, $2, $3, $4, $5, $6::vector)""",
            rows,
        )

    logger.info(
        "source_ingested",
        project_id=project_id,
        source_id=source_id,
        chunks=len(chunks),
        filename=filename,
    )
    return source_id


async def retrieve_context(
    pool: asyncpg.Pool,
    project_id: str,
    query: str,
    top_k: int = 5,
) -> list[str]:
    """Retrieve top-k most relevant chunks for a query via cosine similarity."""
    from app.rag.embeddings import embed_query
    query_embedding = await embed_query(query)
    embedding_literal = f"[{','.join(str(v) for v in query_embedding)}]"

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT content
               FROM rag_chunks
               WHERE project_id = $1
               ORDER BY embedding <=> $2::vector
               LIMIT $3""",
            project_id,
            embedding_literal,
            top_k,
        )

    chunks = [row["content"] for row in rows]
    logger.info("rag_retrieval", project_id=project_id, query_len=len(query), results=len(chunks))
    return chunks

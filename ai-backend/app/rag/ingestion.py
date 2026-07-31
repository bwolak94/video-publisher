"""Source material ingestion: chunk → embed → store in pgvector."""
import hashlib
import math

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
    text: str,
    filename: str = "",
    content_hash: str | None = None,
    tenant_id: str | None = None,
) -> str:
    """Chunk, embed, and store source material. Returns the source ID.

    Idempotent: re-uploading the same content (same project_id + content_hash)
    is a no-op — the existing source_id is returned without re-embedding.
    The rag_sources insert and rag_chunks bulk insert share a single transaction
    so a mid-flight embedding failure leaves no orphaned source rows.
    """
    content_hash = content_hash or hashlib.sha256(text.encode()).hexdigest()

    chunks = chunk_text(text)
    if not chunks:
        raise ValueError("Source content is empty after chunking")

    # Embed in batches before opening a transaction — embedding is the expensive,
    # fallible step; keeping it outside the transaction avoids long-held locks.
    all_embeddings: list[list[float]] = []
    for i in range(0, len(chunks), _EMBED_BATCH_SIZE):
        batch = chunks[i : i + _EMBED_BATCH_SIZE]
        embeddings = await embed_texts(batch)
        for local_idx, emb in enumerate(embeddings):
            _validate_embedding(emb, i + local_idx)
        all_embeddings.extend(embeddings)

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Idempotent source insert — returns existing id if already present.
            row = await conn.fetchrow(
                """INSERT INTO rag_sources (project_id, content_hash, tenant_id, filename)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (project_id, content_hash) DO NOTHING
                   RETURNING id""",
                project_id,
                content_hash,
                tenant_id,
                filename or None,
            )
            if row is None:
                existing = await conn.fetchrow(
                    "SELECT id FROM rag_sources WHERE project_id = $1 AND content_hash = $2",
                    project_id,
                    content_hash,
                )
                source_id = str(existing["id"])
                logger.info(
                    "source_already_exists",
                    project_id=project_id,
                    source_id=source_id,
                    content_hash=content_hash,
                )
                return source_id

            source_id = str(row["id"])

            chunk_rows = [
                (
                    hashlib.sha256(f"{project_id}:{content_hash}:{idx}".encode()).hexdigest()[:32],
                    source_id,
                    project_id,
                    idx,
                    chunk,
                    f"[{','.join(str(v) for v in embedding)}]",
                )
                for idx, (chunk, embedding) in enumerate(zip(chunks, all_embeddings))
            ]
            await conn.executemany(
                """INSERT INTO rag_chunks (id, source_id, project_id, chunk_index, content, embedding)
                   VALUES ($1, $2, $3, $4, $5, $6::vector)
                   ON CONFLICT (id) DO NOTHING""",
                chunk_rows,
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
    top_k: int = 8,
    score_threshold: float = 0.5,
    tenant_id: str | None = None,
) -> list[str]:
    """Retrieve top-k most relevant chunks for a query via cosine similarity.

    Args:
        top_k: Maximum number of chunks to return. Default 8 per RAG conventions.
            Override via Settings in the future.
        score_threshold: Maximum cosine distance to accept (0 = identical, 1 = orthogonal).
            Chunks with distance >= score_threshold are discarded as noise. Default 0.5
            corresponds to cosine similarity > 0.5, filtering clearly irrelevant results.
            Override via Settings in the future.
        tenant_id: When provided, only chunks whose parent rag_sources row carries
            this tenant_id are returned. Enforces project ownership at retrieval time.
    """
    from app.rag.embeddings import embed_query
    query_embedding = await embed_query(query)
    embedding_literal = f"[{','.join(str(v) for v in query_embedding)}]"

    async with pool.acquire() as conn:
        if tenant_id is not None:
            rows = await conn.fetch(
                """SELECT c.content, (c.embedding <=> $2::vector) AS distance
                   FROM rag_chunks c
                   JOIN rag_sources s ON s.id = c.source_id
                   WHERE c.project_id = $1
                     AND s.tenant_id = $5
                     AND (c.embedding <=> $2::vector) < $3
                   ORDER BY distance
                   LIMIT $4""",
                project_id,
                embedding_literal,
                score_threshold,
                top_k,
                tenant_id,
            )
        else:
            rows = await conn.fetch(
                """SELECT content, (embedding <=> $2::vector) AS distance
                   FROM rag_chunks
                   WHERE project_id = $1
                     AND (embedding <=> $2::vector) < $3
                   ORDER BY distance
                   LIMIT $4""",
                project_id,
                embedding_literal,
                score_threshold,
                top_k,
            )

    chunks = [row["content"] for row in rows]
    logger.info(
        "rag_retrieval",
        project_id=project_id,
        query_len=len(query),
        results=len(chunks),
        score_threshold=score_threshold,
        tenant_filtered=tenant_id is not None,
    )
    return chunks

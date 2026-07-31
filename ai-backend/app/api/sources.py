"""Source material ingestion endpoint for Creator Mode RAG."""
import hashlib
import pathlib
from typing import Any

import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.rag.db import get_pool
from app.rag.ingestion import ingest_text

router = APIRouter(prefix="/api/projects", tags=["sources"])
logger = structlog.get_logger(__name__)

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB (PRD NFR-8.4)
_ALLOWED_CONTENT_TYPES = {"text/plain", "application/pdf", "text/markdown", "text/csv", "application/json"}


def _detect_content_type(header: bytes, declared: str | None) -> str:
    """Detect MIME type from magic bytes; fall back to declared Content-Type."""
    if header[:4] == b"%PDF":
        return "application/pdf"
    if header[:3] == b"\xef\xbb\xbf":
        return "text/plain"
    return declared or "application/octet-stream"


@router.post("/{project_id}/sources", status_code=status.HTTP_201_CREATED)
async def ingest_source(
    project_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Ingest a source document for Creator Mode RAG.

    Accepts plain text, PDF (text extraction not yet implemented — submit as .txt),
    markdown, or CSV. Returns the source ID.
    """
    safe_filename = pathlib.Path(file.filename or "unknown").name

    content_bytes = await file.read()
    if len(content_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )

    detected = _detect_content_type(content_bytes[:512], file.content_type)
    if detected not in _ALLOWED_CONTENT_TYPES and (file.content_type or "") not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type not allowed: {file.content_type}",
        )

    try:
        text = content_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode file: {exc}")

    content_hash = hashlib.sha256(content_bytes).hexdigest()

    pool = await get_pool()
    source_id = await ingest_text(pool, project_id, text, filename=safe_filename, content_hash=content_hash)

    logger.info("source_upload_complete", project_id=project_id, source_id=source_id, filename=safe_filename)
    return {"sourceId": source_id, "projectId": project_id, "filename": safe_filename}

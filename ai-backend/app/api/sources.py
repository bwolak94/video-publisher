"""Source material ingestion endpoint for Creator Mode RAG."""
import structlog
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.rag.db import ensure_schema, get_pool
from app.rag.ingestion import ingest_text

router = APIRouter(prefix="/api/projects", tags=["sources"])
logger = structlog.get_logger(__name__)

_MAX_BYTES = 10 * 1024 * 1024  # 10 MB (PRD NFR-8.4)
_ALLOWED_CONTENT_TYPES = {"text/plain", "application/pdf", "text/markdown", "text/csv"}


@router.post("/{project_id}/sources", status_code=status.HTTP_201_CREATED)
async def ingest_source(
    project_id: str,
    file: UploadFile = File(...),
):
    """Ingest a source document for Creator Mode RAG.

    Accepts plain text, PDF (text extraction not yet implemented — submit as .txt),
    markdown, or CSV. Returns the source ID.
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {_ALLOWED_CONTENT_TYPES}",
        )

    content_bytes = await file.read()
    if len(content_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds 10 MB limit",
        )

    try:
        text = content_bytes.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode file: {exc}")

    pool = await get_pool()
    await ensure_schema(pool)

    source_id = await ingest_text(pool, project_id, text, filename=file.filename)

    logger.info("source_upload_complete", project_id=project_id, source_id=source_id, filename=file.filename)
    return {"sourceId": source_id, "projectId": project_id, "filename": file.filename}

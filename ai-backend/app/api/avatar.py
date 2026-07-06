"""FastAPI router for Avatar / Talking Head generation (FEATURE-11).

POST /api/avatar/wav2lip
  Body: { "audio_url": "...", "image_url": "..." }
  Returns: video/mp4 binary (MP4)

GET /api/avatar/health
  Returns: { "available": true/false }

The NestJS Wav2LipService calls this endpoint, then uploads the returned
MP4 bytes to S3/MinIO and stores the s3:// URL in the scene storyboard.
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, HttpUrl

from app.services.wav2lip_service import Wav2LipService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/avatar", tags=["avatar"])

_wav2lip = Wav2LipService()


class Wav2LipRequest(BaseModel):
    audio_url: str
    image_url: str


@router.get("/health")
async def avatar_health() -> dict:
    """Check whether Wav2Lip model files are present on disk."""
    available = await _wav2lip.is_available()
    return {"available": available, "provider": "wav2lip_local"}


@router.post("/wav2lip", response_class=Response)
async def wav2lip_generate(body: Wav2LipRequest) -> Response:
    """Generate a lip-synced talking-head MP4 from audio + face image."""
    logger.info("wav2lip_request", audio_url=body.audio_url, image_url=body.image_url)

    if not await _wav2lip.is_available():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Wav2Lip model not found. "
                "Set WAV2LIP_DIR and WAV2LIP_CHECKPOINT env vars and ensure the model is downloaded."
            ),
        )

    try:
        mp4_bytes = await _wav2lip.synthesize(body.audio_url, body.image_url)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        logger.error("wav2lip_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Wav2Lip generation failed: {exc}",
        )

    logger.info("wav2lip_success", mp4_bytes=len(mp4_bytes))
    return Response(content=mp4_bytes, media_type="video/mp4")

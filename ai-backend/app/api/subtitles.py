"""
FastAPI router for subtitle/transcription endpoints (FEATURE-04).
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator

from app.services import whisper_local

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/subtitles", tags=["subtitles"])


class TranscribeRequest(BaseModel):
    """Audio download URL (public MinIO or any HTTPS URL) and optional language hint."""

    audio_url: str
    language: str | None = None

    @field_validator("audio_url")
    @classmethod
    def audio_url_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("audio_url must not be empty")
        return v


class WordTimestamp(BaseModel):
    word: str
    start: float
    end: float
    confidence: float


class TranscribeResponse(BaseModel):
    words: list[WordTimestamp]
    language: str
    provider: str = "whisper_local"


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe audio to word-level timestamps",
)
async def transcribe_audio(req: TranscribeRequest) -> TranscribeResponse:
    """
    Download audio from `audio_url`, run faster-whisper, return word-level timestamps.

    - **audio_url**: Public HTTP(S) URL pointing to an MP3/WAV/MP4 file
    - **language**: ISO 639-1 language hint (e.g. "en", "de"). Omit for auto-detection.
    """
    try:
        result = await whisper_local.transcribe(
            audio_url=req.audio_url,
            language=req.language,
        )
    except RuntimeError as exc:
        logger.error("whisper_not_installed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.error("whisper_transcription_failed", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {exc}",
        ) from exc

    return TranscribeResponse(**result)

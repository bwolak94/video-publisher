"""FastAPI router for local Piper TTS (FEATURE-08).

POST /api/tts/piper
  Body: { "text": "...", "model_name": "en_US-lessac-medium" }
  Returns: audio/mpeg binary (MP3)

The NestJS TtsProviderRegistry calls this endpoint when a scene uses a
``piper_*`` voiceId, then uploads the returned MP3 bytes to S3/MinIO.
"""
from __future__ import annotations

import os

import structlog
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, field_validator

from app.services.piper_tts import PiperTTSService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/tts", tags=["tts"])

_piper = PiperTTSService(
    models_dir=os.environ.get("PIPER_MODELS_DIR", "/models/piper"),
    binary=os.environ.get("PIPER_BINARY", "piper"),
)


class PiperRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    text: str
    model_name: str  # e.g. "en_US-lessac-medium"

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("text must not be empty")
        return v

    @field_validator("model_name")
    @classmethod
    def model_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("model_name must not be empty")
        return v


@router.post("/piper", response_class=Response)
async def piper_tts(body: PiperRequest) -> Response:
    """Synthesize speech with a local Piper voice model and return MP3 audio."""
    logger.info("piper_tts_request", model=body.model_name, text_len=len(body.text))

    try:
        mp3_bytes = await _piper.synthesize(body.text, body.model_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except RuntimeError as exc:
        logger.error("piper_tts_failed", model=body.model_name, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Piper TTS failed: {exc}",
        )

    logger.info("piper_tts_success", model=body.model_name, mp3_bytes=len(mp3_bytes))
    return Response(content=mp3_bytes, media_type="audio/mpeg")

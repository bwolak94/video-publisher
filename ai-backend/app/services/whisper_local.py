"""
Whisper local transcription service using faster-whisper (FEATURE-04).

Loads the 'base' model once at module level (singleton). Uses int8 quantisation
on CPU so it runs without a GPU. Returns word-level timestamps compatible with
the NestJS WordTimestamp interface.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

_model: Any = None


def _get_model() -> Any:
    """Lazy singleton — loads the model on first call."""
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel

            model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
            logger.info("loading_whisper_model", model_size=model_size)
            _model = WhisperModel(model_size, device="cpu", compute_type="int8")
            logger.info("whisper_model_loaded", model_size=model_size)
        except ImportError:
            raise RuntimeError(
                "faster-whisper is not installed. "
                "Add 'faster-whisper' to pyproject.toml and reinstall dependencies."
            )
    return _model


async def transcribe(audio_url: str, language: str | None = None) -> dict[str, Any]:
    """
    Download audio from `audio_url`, run faster-whisper transcription,
    and return word-level timestamps.

    Returns:
        {
            "words": [{"word": str, "start": float, "end": float, "confidence": float}],
            "language": str,
            "provider": "whisper_local"
        }
    """
    logger.info("whisper_transcribe_start", audio_url=audio_url, language=language)

    # Download audio to a temporary file
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(audio_url)
        response.raise_for_status()
        audio_bytes = response.content

    suffix = _infer_suffix(audio_url)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        model = _get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=language or None,  # None = auto-detect
            word_timestamps=True,
            beam_size=5,
        )

        words = []
        for segment in segments:
            if not segment.words:
                continue
            for word in segment.words:
                words.append(
                    {
                        "word": word.word.strip(),
                        "start": round(word.start, 3),
                        "end": round(word.end, 3),
                        "confidence": round(word.probability, 4),
                    }
                )

        detected_language = info.language or language or "en"
        logger.info(
            "whisper_transcribe_done",
            audio_url=audio_url,
            word_count=len(words),
            language=detected_language,
        )

        return {
            "words": words,
            "language": detected_language,
            "provider": "whisper_local",
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _infer_suffix(url: str) -> str:
    lower = url.lower().split("?")[0]
    for ext in (".mp3", ".mp4", ".wav", ".ogg", ".webm", ".m4a"):
        if lower.endswith(ext):
            return ext
    return ".mp3"

"""Piper TTS subprocess wrapper (FEATURE-08).

Runs the `piper` CLI binary to synthesize speech from text,
converts WAV output to MP3 via ffmpeg, and returns raw MP3 bytes.

The caller (NestJS TtsProviderRegistry) handles S3 upload and Redis caching.
"""
from __future__ import annotations

import asyncio
import os
import tempfile

import structlog

logger = structlog.get_logger(__name__)


class PiperTTSService:
    """Thin async wrapper around the `piper` CLI binary."""

    def __init__(
        self,
        models_dir: str = "/models/piper",
        binary: str = "piper",
    ) -> None:
        self.models_dir = models_dir
        self.binary = binary

    async def synthesize(self, text: str, model_name: str) -> bytes:
        """Synthesize speech and return MP3 bytes.

        Args:
            text: Narration text to synthesize.
            model_name: Piper model name without extension,
                        e.g. ``"en_US-lessac-medium"``.

        Returns:
            MP3 audio as raw bytes.

        Raises:
            FileNotFoundError: If the .onnx model file does not exist.
            RuntimeError: If piper or ffmpeg subprocess fails.
        """
        model_path = os.path.join(self.models_dir, f"{model_name}.onnx")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Piper model not found: {model_path}. "
                f"Download it to PIPER_MODELS_DIR ({self.models_dir})."
            )

        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "out.wav")
            mp3_path = os.path.join(tmp, "out.mp3")

            await self._run_piper(text, model_path, wav_path)
            await self._wav_to_mp3(wav_path, mp3_path)

            with open(mp3_path, "rb") as f:
                return f.read()

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _run_piper(self, text: str, model_path: str, wav_path: str) -> None:
        """Run piper CLI to generate a WAV file from text."""
        proc = await asyncio.create_subprocess_exec(
            self.binary,
            "--model", model_path,
            "--output_file", wav_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate(input=text.encode())
        if proc.returncode != 0:
            raise RuntimeError(
                f"Piper exited {proc.returncode}: "
                f"{stderr.decode(errors='replace')[:400]}"
            )
        logger.debug("piper_wav_generated", model=model_path, wav=wav_path)

    async def _wav_to_mp3(self, wav_path: str, mp3_path: str) -> None:
        """Convert WAV to MP3 via ffmpeg (libmp3lame, VBR quality 4 ≈ 165 kbps)."""
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y",
            "-i", wav_path,
            "-codec:a", "libmp3lame",
            "-q:a", "4",
            mp3_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(
                f"ffmpeg WAV→MP3 failed: "
                f"{stderr.decode(errors='replace')[:400]}"
            )
        logger.debug("ffmpeg_mp3_generated", mp3=mp3_path)

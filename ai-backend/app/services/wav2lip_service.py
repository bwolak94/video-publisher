"""Wav2Lip service — local talking-head lip-sync (FEATURE-11).

Wraps the open-source Wav2Lip model CLI to generate a lip-synced MP4 from:
  - an audio file (MP3/WAV)
  - a face image (JPEG/PNG)

Prerequisites (configured via env vars or defaults):
  WAV2LIP_DIR     — path to the Wav2Lip repo (default /opt/wav2lip)
  WAV2LIP_CHECKPOINT — path to .pth checkpoint (default /opt/wav2lip/checkpoints/wav2lip.pth)

Output: MP4 bytes returned in-memory.
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import httpx
import structlog

logger = structlog.get_logger(__name__)

WAV2LIP_DIR = os.environ.get("WAV2LIP_DIR", "/opt/wav2lip")
WAV2LIP_CHECKPOINT = os.environ.get("WAV2LIP_CHECKPOINT", "/opt/wav2lip/checkpoints/wav2lip.pth")
WAV2LIP_INFERENCE = os.path.join(WAV2LIP_DIR, "inference.py")

# Maximum source file sizes
MAX_AUDIO_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_IMAGE_BYTES = 5 * 1024 * 1024    # 5 MB


class Wav2LipService:
    """Generate talking-head MP4 via local Wav2Lip subprocess."""

    async def is_available(self) -> bool:
        """Return True if the Wav2Lip model files exist on disk."""
        return Path(WAV2LIP_INFERENCE).is_file() and Path(WAV2LIP_CHECKPOINT).is_file()

    async def synthesize(self, audio_url: str, image_url: str) -> bytes:
        """
        Download audio + image, run Wav2Lip inference, return MP4 bytes.

        Parameters
        ----------
        audio_url : str
            Publicly accessible URL (or s3://) of the narration audio (MP3/WAV).
        image_url : str
            Publicly accessible URL (or s3://) of the presenter photo (JPEG/PNG).
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "audio.mp3")
            image_path = os.path.join(tmpdir, "face.jpg")
            output_path = os.path.join(tmpdir, "result.mp4")

            await self._download(audio_url, audio_path, MAX_AUDIO_BYTES)
            await self._download(image_url, image_path, MAX_IMAGE_BYTES)

            await self._run_wav2lip(audio_path, image_path, output_path)

            return Path(output_path).read_bytes()

    # ── Private ───────────────────────────────────────────────────────────────

    async def _download(self, url: str, dest: str, max_bytes: int) -> None:
        """Download a URL to a local file, enforcing a size cap."""
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                written = 0
                with open(dest, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        written += len(chunk)
                        if written > max_bytes:
                            raise ValueError(f"Source file exceeds {max_bytes // 1024 // 1024} MB limit")
                        f.write(chunk)

    async def _run_wav2lip(self, audio_path: str, face_path: str, output_path: str) -> None:
        """Invoke the Wav2Lip inference script as a subprocess."""
        cmd = [
            "python",
            WAV2LIP_INFERENCE,
            "--checkpoint_path", WAV2LIP_CHECKPOINT,
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", output_path,
            "--nosmooth",
        ]

        logger.info("wav2lip_inference_start", checkpoint=WAV2LIP_CHECKPOINT)

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            err_text = stderr.decode(errors="replace")[:2000]
            logger.error("wav2lip_inference_failed", returncode=proc.returncode, stderr=err_text)
            raise RuntimeError(f"Wav2Lip inference failed (exit {proc.returncode}): {err_text}")

        if not Path(output_path).exists():
            raise RuntimeError("Wav2Lip produced no output file")

        logger.info("wav2lip_inference_success", output_bytes=Path(output_path).stat().st_size)

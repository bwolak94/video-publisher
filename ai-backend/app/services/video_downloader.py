"""Reference video downloader for FEATURE-06.

Supports:
  - YouTube URLs via yt-dlp (best video ≤1080p, no playlist)
  - Direct video URLs (.mp4 / .webm / .mov / .avi) via httpx streaming

Safety limits:
  - Max file size: 500 MB
  - Max duration: 3600 s (1 hour) — enforced by yt-dlp via --match-filter

Returns the path to a temporary file; caller is responsible for deletion.
"""
import asyncio
import os
import re
import tempfile
from urllib.parse import urlparse

import httpx
import structlog

logger = structlog.get_logger(__name__)

_MAX_BYTES = 500 * 1024 * 1024   # 500 MB
_MAX_DURATION_S = 3600           # 1 hour
_DIRECT_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"}
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"}


def _is_youtube_url(url: str) -> bool:
    return urlparse(url).hostname in _YOUTUBE_HOSTS


def _is_direct_video_url(url: str) -> bool:
    path = urlparse(url).path.lower().split("?")[0]
    return any(path.endswith(ext) for ext in _DIRECT_VIDEO_EXTS)


async def download_reference_video(url: str) -> str:
    """Download a reference video to a temp file. Returns the temp file path.

    Raises ValueError for unsupported URLs.
    Raises RuntimeError on download failure.
    """
    if _is_youtube_url(url):
        return await _download_youtube(url)
    if _is_direct_video_url(url):
        return await _download_direct(url)
    raise ValueError(
        f"Unsupported URL. Must be a YouTube URL or direct video file link (.mp4/.webm/…). Got: {url}"
    )


async def _download_youtube(url: str) -> str:
    """Use yt-dlp to download the best ≤1080p stream to a temp file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp.close()
    output_path = tmp.name

    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--format", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
        "--merge-output-format", "mp4",
        "--match-filter", f"duration <= {_MAX_DURATION_S}",
        "--output", output_path,
        "--no-progress",
        "--quiet",
        url,
    ]

    logger.info("yt_dlp_download_start", url=url)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

        if proc.returncode != 0:
            err_msg = stderr.decode(errors="replace")[:500]
            raise RuntimeError(f"yt-dlp failed (exit {proc.returncode}): {err_msg}")

        size = os.path.getsize(output_path)
        if size > _MAX_BYTES:
            os.unlink(output_path)
            raise ValueError(f"Video too large: {size / 1_048_576:.0f} MB (limit 500 MB)")

        logger.info("yt_dlp_download_done", url=url, size_mb=round(size / 1_048_576, 1))
        return output_path

    except Exception:
        _safe_delete(output_path)
        raise


async def _download_direct(url: str) -> str:
    """Download a direct video URL with httpx streaming."""
    suffix = os.path.splitext(urlparse(url).path.split("?")[0])[1] or ".mp4"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)

    logger.info("direct_video_download_start", url=url)
    try:
        downloaded = 0
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=300.0)) as client:
            async with client.stream("GET", url, follow_redirects=True) as res:
                res.raise_for_status()
                async for chunk in res.aiter_bytes(chunk_size=65536):
                    downloaded += len(chunk)
                    if downloaded > _MAX_BYTES:
                        tmp.close()
                        _safe_delete(tmp.name)
                        raise ValueError(f"Video exceeds 500 MB limit")
                    tmp.write(chunk)

        tmp.close()
        logger.info("direct_video_download_done", url=url, size_mb=round(downloaded / 1_048_576, 1))
        return tmp.name

    except Exception:
        tmp.close()
        _safe_delete(tmp.name)
        raise


def _safe_delete(path: str) -> None:
    try:
        if path and os.path.exists(path):
            os.unlink(path)
    except OSError:
        pass

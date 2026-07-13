"""Pre-render asset validation via FFprobe — FEATURE-07 Quality Gates.

Probes presigned S3 URLs directly (no full download) to check:
  - Video stream present + supported codec (h264/hevc/vp8/vp9/av1)
  - Audio stream present + supported codec (aac/mp3/opus/vorbis)
  - Duration > 0
  - Video duration >= expected narration duration (when provided)

Called by NestJS PreRenderValidatorService before dispatching render jobs.
"""
import asyncio
import json
from typing import Any, Literal

import structlog

from app.services.ffprobe_service import _run

logger = structlog.get_logger(__name__)

_VALID_VIDEO_CODECS = ("h264", "hevc", "vp8", "vp9", "av1", "mpeg4")
_VALID_AUDIO_CODECS = ("aac", "mp3", "opus", "vorbis", "pcm")
_VALID_VIDEO_FORMATS = ("mp4", "mov", "matroska", "webm")


async def _probe_url(url: str) -> dict[str, Any]:
    """Run ffprobe on a presigned URL. Returns parsed JSON dict."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        url,
    ]
    stdout, _ = await _run(cmd, timeout=30)
    return json.loads(stdout)


async def validate_single_asset(
    scene_id: str,
    asset_url: str,
    asset_type: Literal["video", "audio"],
    expected_min_duration: float | None = None,
) -> dict[str, Any]:
    """Validate one asset via FFprobe. Returns AssetValidationResult dict."""
    try:
        data = await _probe_url(asset_url)
    except Exception as exc:
        logger.warning(
            "asset_probe_failed",
            scene_id=scene_id,
            asset_type=asset_type,
            error=str(exc),
        )
        return {
            "sceneId": scene_id,
            "assetType": asset_type,
            "valid": False,
            "codec": None,
            "durationSeconds": None,
            "error": f"FFprobe failed: {exc}",
        }

    streams = data.get("streams", [])
    fmt = data.get("format", {})
    duration = float(fmt.get("duration", 0) or 0)

    errors: list[str] = []

    if asset_type == "video":
        video_streams = [s for s in streams if s.get("codec_type") == "video"]
        if not video_streams:
            return {
                "sceneId": scene_id,
                "assetType": "video",
                "valid": False,
                "codec": None,
                "durationSeconds": duration,
                "error": "No video stream found",
            }
        codec = video_streams[0].get("codec_name", "")
        fmt_name = fmt.get("format_name", "")

        if not any(c in codec for c in _VALID_VIDEO_CODECS):
            errors.append(f"Unsupported video codec: {codec!r}")
        if not any(f in fmt_name for f in _VALID_VIDEO_FORMATS):
            errors.append(f"Unsupported video container: {fmt_name!r}")
        if duration <= 0:
            errors.append("Zero or invalid duration")
        if expected_min_duration and duration < expected_min_duration:
            errors.append(
                f"Video duration {duration:.1f}s is shorter than "
                f"narration duration {expected_min_duration:.1f}s"
            )

        return {
            "sceneId": scene_id,
            "assetType": "video",
            "valid": len(errors) == 0,
            "codec": codec,
            "durationSeconds": duration,
            "error": "; ".join(errors) if errors else None,
        }

    else:  # audio
        audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
        if not audio_streams:
            return {
                "sceneId": scene_id,
                "assetType": "audio",
                "valid": False,
                "codec": None,
                "durationSeconds": duration,
                "error": "No audio stream found",
            }
        codec = audio_streams[0].get("codec_name", "")

        if not any(c in codec for c in _VALID_AUDIO_CODECS):
            errors.append(f"Unsupported audio codec: {codec!r}")
        if duration <= 0:
            errors.append("Zero or invalid duration")

        return {
            "sceneId": scene_id,
            "assetType": "audio",
            "valid": len(errors) == 0,
            "codec": codec,
            "durationSeconds": duration,
            "error": "; ".join(errors) if errors else None,
        }


async def validate_assets(assets: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate a batch of assets in parallel.

    Each asset dict must have: sceneId, assetUrl, assetType.
    Optional: expectedMinDurationSeconds.

    Returns: { allValid: bool, results: AssetValidationResult[] }
    """
    tasks = [
        validate_single_asset(
            a["sceneId"],
            a["assetUrl"],
            a["assetType"],
            a.get("expectedMinDurationSeconds"),
        )
        for a in assets
    ]
    results = await asyncio.gather(*tasks)
    return {
        "allValid": all(r["valid"] for r in results),
        "results": list(results),
    }

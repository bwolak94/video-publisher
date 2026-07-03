"""FFprobe/FFmpeg wrappers for FEATURE-06 — Reference Video Analysis.

All subprocess calls are async (asyncio.create_subprocess_exec) so they
never block the FastAPI event loop.
"""
import asyncio
import base64
import json
import os
import tempfile
from dataclasses import dataclass, field

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class VideoStructure:
    """Result of FFprobe structural analysis."""
    duration_seconds: float
    width: int
    height: int
    fps: float
    has_audio: bool
    scene_timestamps: list[float] = field(default_factory=list)  # seconds of scene cuts
    avg_loudness_lufs: float = -23.0


async def probe_video(path: str) -> VideoStructure:
    """Extract video metadata via ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        path,
    ]
    stdout, _ = await _run(cmd, timeout=30)

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"ffprobe returned unparseable output: {stdout[:200]}")

    duration = float(data.get("format", {}).get("duration", 0))
    width = height = fps_val = 0
    has_audio = False

    for stream in data.get("streams", []):
        codec_type = stream.get("codec_type", "")
        if codec_type == "video" and not width:
            width = stream.get("width", 0)
            height = stream.get("height", 0)
            fps_str = stream.get("r_frame_rate", "0/1")
            try:
                num, den = fps_str.split("/")
                fps_val = float(num) / float(den) if float(den) else 0
            except (ValueError, ZeroDivisionError):
                fps_val = 0
        elif codec_type == "audio":
            has_audio = True

    return VideoStructure(
        duration_seconds=duration,
        width=width,
        height=height,
        fps=fps_val,
        has_audio=has_audio,
    )


async def detect_scenes(path: str, threshold: float = 0.35) -> list[float]:
    """Detect scene changes via FFmpeg filter. Returns list of timestamps (seconds).

    Uses ffmpeg's `select` + `showinfo` filter combo — no external library needed.
    Threshold 0.35 is a good balance between over/under-segmentation.
    """
    cmd = [
        "ffmpeg",
        "-i", path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr",
        "-f", "null",
        "-an",
        "-",
    ]
    # ffmpeg outputs scene info to stderr
    _, stderr = await _run(cmd, timeout=120)

    timestamps: list[float] = [0.0]  # first scene always starts at 0
    for line in stderr.splitlines():
        if b"pts_time:" in line:
            try:
                part = line.split(b"pts_time:")[1].split()[0]
                t = float(part)
                if t > 0:
                    timestamps.append(t)
            except (IndexError, ValueError):
                pass

    return sorted(timestamps)


async def measure_audio_loudness(path: str) -> float:
    """Measure integrated loudness in LUFS using ffmpeg's ebur128 filter."""
    cmd = [
        "ffmpeg",
        "-i", path,
        "-af", "ebur128=peak=true",
        "-f", "null",
        "-",
    ]
    _, stderr = await _run(cmd, timeout=120)

    # Parse "Integrated loudness: I: -23.5 LUFS" from stderr
    for line in stderr.splitlines():
        if b"I:" in line and b"LUFS" in line:
            try:
                parts = line.decode(errors="replace").strip().split()
                i_idx = parts.index("I:")
                return float(parts[i_idx + 1])
            except (ValueError, IndexError):
                pass

    return -23.0  # EBU R 128 broadcast reference if parsing fails


async def sample_frames(path: str, n: int = 5) -> list[str]:
    """Extract N evenly-spaced frames as base64 JPEG strings.

    Used to feed to GPT-4o Vision for visual style analysis.
    """
    # Probe duration first
    info = await probe_video(path)
    duration = max(info.duration_seconds, 1.0)
    interval = duration / (n + 1)

    frames: list[str] = []
    for i in range(1, n + 1):
        t = interval * i
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        tmp.close()

        cmd = [
            "ffmpeg",
            "-ss", str(t),
            "-i", path,
            "-frames:v", "1",
            "-q:v", "5",       # quality 5 ≈ 85% JPEG quality
            "-vf", "scale=640:-1",  # resize to 640px wide for smaller payload
            "-y",
            tmp.name,
        ]
        try:
            await _run(cmd, timeout=30)
            with open(tmp.name, "rb") as f:
                frames.append(base64.b64encode(f.read()).decode())
        except Exception as exc:
            logger.warning("frame_sample_failed", time=t, error=str(exc))
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    return frames


async def extract_audio(path: str) -> str:
    """Extract audio track from video as a temp MP3 file. Returns temp path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()

    cmd = [
        "ffmpeg",
        "-i", path,
        "-vn",
        "-ar", "16000",   # 16kHz — optimal for Whisper
        "-ac", "1",       # mono
        "-ab", "96k",
        "-y",
        tmp.name,
    ]
    await _run(cmd, timeout=300)
    return tmp.name


async def probe_bitrates(path: str) -> tuple[float, float]:
    """Return (video_kbps, audio_kbps) for a media file.

    Uses ffprobe stream-level bit_rate fields. Falls back to format-level
    bit_rate split 80/20 if per-stream values are missing.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        path,
    ]
    stdout, _ = await _run(cmd, timeout=30)
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError:
        return 0.0, 0.0

    video_kbps = 0.0
    audio_kbps = 0.0
    format_kbps = float(data.get("format", {}).get("bit_rate", 0)) / 1000.0

    for stream in data.get("streams", []):
        codec_type = stream.get("codec_type", "")
        br = float(stream.get("bit_rate", 0)) / 1000.0
        if codec_type == "video" and not video_kbps:
            video_kbps = br
        elif codec_type == "audio" and not audio_kbps:
            audio_kbps = br

    # Fallback: distribute format bitrate 80/20 if per-stream missing
    if not video_kbps and not audio_kbps and format_kbps:
        video_kbps = format_kbps * 0.8
        audio_kbps = format_kbps * 0.2

    return video_kbps, audio_kbps


async def detect_black_frames(path: str, threshold: float = 0.98) -> int:
    """Count black frame segments using FFmpeg blackdetect filter.

    threshold: fraction of pixels that must be black (0.98 = 98%).
    Each detected black segment (d ≥ 0.05s) counts as one.
    """
    cmd = [
        "ffmpeg",
        "-i", path,
        "-vf", f"blackdetect=d=0.05:pix_th={threshold}",
        "-an",
        "-f", "null",
        "-",
    ]
    _, stderr = await _run(cmd, timeout=120)

    return sum(1 for line in stderr.splitlines() if b"black_start" in line)


async def detect_frozen_frames(path: str, noise_db: float = -60.0, min_duration: float = 2.0) -> int:
    """Count frozen-frame segments using FFmpeg freezedetect filter.

    Returns count of continuous freeze segments (each ≥ min_duration seconds).
    """
    cmd = [
        "ffmpeg",
        "-i", path,
        "-vf", f"freezedetect=n={noise_db}dB:d={min_duration}",
        "-an",
        "-f", "null",
        "-",
    ]
    _, stderr = await _run(cmd, timeout=120)

    return sum(1 for line in stderr.splitlines() if b"freeze_start" in line)


async def count_scene_changes(path: str, threshold: float = 0.1) -> int:
    """Count scene changes (cuts) using FFmpeg select filter.

    Low count relative to duration → high slideshow risk.
    """
    cmd = [
        "ffmpeg",
        "-i", path,
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-vsync", "vfr",
        "-f", "null",
        "-an",
        "-",
    ]
    _, stderr = await _run(cmd, timeout=120)

    return sum(1 for line in stderr.splitlines() if b"pts_time:" in line)


async def _run(cmd: list[str], timeout: float = 60) -> tuple[bytes, bytes]:
    """Run a subprocess and return (stdout, stderr). Raises RuntimeError on non-zero exit."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)

    if proc.returncode not in (0, None):
        error_text = stderr.decode(errors="replace")
        # returncode=1 is acceptable for ffmpeg filter commands (-f null, showinfo, ebur128)
        # Raise only when exit code ≥ 2 or when stderr starts with a genuine error indicator
        stderr_head = stderr[:300].lower()
        is_fatal_message = (
            b"no such file" in stderr_head
            or b"invalid data" in stderr_head
            or b"error opening input" in stderr_head
            or b"unrecognized option" in stderr_head
            or b"option .* not found" in stderr_head
        )
        if proc.returncode not in (0, 1) or (proc.returncode == 1 and is_fatal_message):
            raise RuntimeError(
                f"Command failed (exit {proc.returncode}): {' '.join(cmd[:3])}… "
                f"stderr: {error_text[:300]}"
            )

    return stdout, stderr

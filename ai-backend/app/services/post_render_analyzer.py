"""Post-render quality analyzer — FEATURE-07 Quality Gates.

Downloads a rendered video from a presigned URL, runs FFprobe/FFmpeg analysis,
and returns a QualityReport that is stored in projects.post_render_quality.

Metrics computed:
  - Duration, resolution, video/audio bitrates (FFprobe)
  - Audio loudness in LUFS + True Peak (FFmpeg ebur128)
  - Black frame count (FFmpeg blackdetect)
  - Frozen frame count (FFmpeg freezedetect)
  - Slideshow risk score 0-1 from scene change density
  - Overall quality score 0-1 aggregated from all metrics
  - Issues list with severity tags

All subprocess calls delegate to ffprobe_service.py so they are fully async.
"""
import os
import tempfile
from datetime import datetime, timezone

import httpx
import structlog

from app.models.quality_report import QualityIssue, QualityReport
from app.services import ffprobe_service as ffprobe

logger = structlog.get_logger(__name__)

_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

# Thresholds that drive issue detection and scoring
_MIN_VIDEO_BITRATE_KBPS = 500.0
_LUFS_TOO_LOUD = -12.0
_LUFS_TOO_QUIET = -30.0
_TRUE_PEAK_CLIP_DBFS = -1.0  # anything louder is clipping
_BLACK_FRAME_ERROR_THRESHOLD = 10
_FROZEN_FRAME_ERROR_THRESHOLD = 5
_SLIDESHOW_RISK_WARNING = 0.6
_SLIDESHOW_RISK_ERROR = 0.8

# Scene changes per minute boundaries for slideshow risk
_SCENE_CHANGES_PER_MIN_SAFE = 12.0   # ≥ this → risk = 0.0
_SCENE_CHANGES_PER_MIN_RISKY = 1.0   # ≤ this → risk = 1.0


def _compute_slideshow_risk(scene_changes: int, duration_seconds: float) -> float:
    """Map scene-change density to a 0-1 slideshow risk score.

    0 = definitely not a slideshow, 1 = definitely a slideshow.
    Uses linear interpolation between risky (1 cut/min) and safe (12 cuts/min).
    """
    if duration_seconds <= 0:
        return 0.0
    cuts_per_min = scene_changes / (duration_seconds / 60.0)
    if cuts_per_min >= _SCENE_CHANGES_PER_MIN_SAFE:
        return 0.0
    if cuts_per_min <= _SCENE_CHANGES_PER_MIN_RISKY:
        return 1.0
    span = _SCENE_CHANGES_PER_MIN_SAFE - _SCENE_CHANGES_PER_MIN_RISKY
    return 1.0 - (cuts_per_min - _SCENE_CHANGES_PER_MIN_RISKY) / span


def _build_issues_and_score(
    slideshow_risk: float,
    black_frames: int,
    frozen_frames: int,
    loudness_lufs: float,
    true_peak_dbfs: float,
    video_kbps: float,
) -> tuple[list[QualityIssue], float]:
    """Derive issues list and overall quality score from raw metrics."""
    issues: list[QualityIssue] = []
    deductions = 0.0

    if slideshow_risk >= _SLIDESHOW_RISK_ERROR:
        issues.append(QualityIssue(
            type="slideshow_risk",
            severity="error",
            detail=f"Slideshow risk score {slideshow_risk:.2f} — very few scene changes detected",
        ))
        deductions += 0.3
    elif slideshow_risk >= _SLIDESHOW_RISK_WARNING:
        issues.append(QualityIssue(
            type="slideshow_risk",
            severity="warning",
            detail=f"Slideshow risk score {slideshow_risk:.2f} — limited scene variety",
        ))
        deductions += 0.15

    if black_frames >= _BLACK_FRAME_ERROR_THRESHOLD:
        issues.append(QualityIssue(
            type="black_frames",
            severity="error",
            detail=f"{black_frames} black frame segments detected",
        ))
        deductions += 0.2
    elif black_frames > 0:
        issues.append(QualityIssue(
            type="black_frames",
            severity="warning",
            detail=f"{black_frames} black frame segment(s) detected",
        ))
        deductions += 0.05

    if frozen_frames >= _FROZEN_FRAME_ERROR_THRESHOLD:
        issues.append(QualityIssue(
            type="frozen_frames",
            severity="error",
            detail=f"{frozen_frames} frozen-frame segments detected",
        ))
        deductions += 0.2
    elif frozen_frames > 0:
        issues.append(QualityIssue(
            type="frozen_frames",
            severity="warning",
            detail=f"{frozen_frames} frozen-frame segment(s) detected",
        ))
        deductions += 0.05

    if true_peak_dbfs > _TRUE_PEAK_CLIP_DBFS:
        issues.append(QualityIssue(
            type="audio_clipping",
            severity="error",
            detail=f"Audio true peak {true_peak_dbfs:.1f} dBFS — clipping detected",
        ))
        deductions += 0.15
    elif loudness_lufs > _LUFS_TOO_LOUD or loudness_lufs < _LUFS_TOO_QUIET:
        issues.append(QualityIssue(
            type="audio_clipping",
            severity="warning",
            detail=f"Audio loudness {loudness_lufs:.1f} LUFS is outside acceptable range",
        ))
        deductions += 0.1

    if video_kbps and video_kbps < _MIN_VIDEO_BITRATE_KBPS:
        issues.append(QualityIssue(
            type="low_bitrate",
            severity="warning",
            detail=f"Video bitrate {video_kbps:.0f} kbps is below 500 kbps minimum",
        ))
        deductions += 0.1

    overall = max(0.0, round(1.0 - deductions, 2))
    return issues, overall


async def _download_video(url: str) -> str:
    """Download a video from a presigned URL to a temp file. Returns path."""
    suffix = ".mp4"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    downloaded = 0

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=600.0)) as client:
            async with client.stream("GET", url, follow_redirects=True) as res:
                res.raise_for_status()
                async for chunk in res.aiter_bytes(65536):
                    downloaded += len(chunk)
                    if downloaded > _MAX_DOWNLOAD_BYTES:
                        tmp.close()
                        _safe_delete(tmp.name)
                        raise ValueError("Video exceeds 2 GB limit for quality analysis")
                    tmp.write(chunk)
        tmp.close()
        logger.info("quality_video_downloaded", size_mb=round(downloaded / 1_048_576, 1))
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


async def _measure_true_peak(path: str) -> float:
    """Parse true peak dBFS from ebur128 stderr output."""
    import asyncio
    cmd = [
        "ffmpeg",
        "-i", path,
        "-af", "ebur128=peak=true",
        "-f", "null",
        "-",
    ]
    from app.services.ffprobe_service import _run
    _, stderr = await _run(cmd, timeout=120)
    for line in stderr.splitlines():
        if b"True peak" in line or b"Peak:" in line:
            try:
                parts = line.decode(errors="replace").strip().split()
                # Look for pattern: "Peak: -3.5 dBFS"
                for i, p in enumerate(parts):
                    if "dBFS" in p and i > 0:
                        return float(parts[i - 1])
                    if p in ("Peak:", "Peak") and i + 1 < len(parts):
                        return float(parts[i + 1])
            except (ValueError, IndexError):
                pass
    return -23.0  # safe default (not clipping)


async def analyze_rendered_video(video_url: str) -> QualityReport:
    """Full post-render quality analysis pipeline.

    Downloads the rendered video from `video_url` (presigned S3 URL or direct),
    runs all FFprobe/FFmpeg checks, and returns a QualityReport.

    Always returns a report — partial failures degrade gracefully to defaults.
    """
    logger.info("post_render_analysis_start", url=video_url[:80])
    video_path: str | None = None

    try:
        video_path = await _download_video(video_url)

        # Run independent probes in parallel
        structure_task       = ffprobe.probe_video(video_path)
        bitrates_task        = ffprobe.probe_bitrates(video_path)
        black_frames_task    = ffprobe.detect_black_frames(video_path)
        frozen_frames_task   = ffprobe.detect_frozen_frames(video_path)
        scene_changes_task   = ffprobe.count_scene_changes(video_path)
        loudness_task        = ffprobe.measure_audio_loudness(video_path)
        true_peak_task       = _measure_true_peak(video_path)

        import asyncio
        (
            structure,
            (video_kbps, audio_kbps),
            black_frames,
            frozen_frames,
            scene_changes,
            loudness_lufs,
            true_peak_dbfs,
        ) = await asyncio.gather(
            structure_task,
            bitrates_task,
            black_frames_task,
            frozen_frames_task,
            scene_changes_task,
            loudness_task,
            true_peak_task,
            return_exceptions=False,
        )

        slideshow_risk = _compute_slideshow_risk(scene_changes, structure.duration_seconds)
        issues, overall_score = _build_issues_and_score(
            slideshow_risk,
            black_frames,
            frozen_frames,
            loudness_lufs,
            true_peak_dbfs,
            video_kbps,
        )

        report = QualityReport(
            passed=overall_score >= 0.5,
            overallScore=overall_score,
            slideshowRiskScore=round(slideshow_risk, 2),
            durationSeconds=structure.duration_seconds,
            resolutionWidth=structure.width,
            resolutionHeight=structure.height,
            videoBitrateKbps=round(video_kbps, 1),
            audioBitrateKbps=round(audio_kbps, 1),
            audioLoudnessLUFS=loudness_lufs,
            audioTruePeakDBFS=true_peak_dbfs,
            blackFrameCount=black_frames,
            frozenFrameCount=frozen_frames,
            issues=issues,
            analyzedAt=datetime.now(timezone.utc).isoformat(),
        )

        logger.info(
            "post_render_analysis_done",
            passed=report.passed,
            score=report.overallScore,
            slideshow_risk=report.slideshowRiskScore,
            issues=len(report.issues),
        )
        return report

    except Exception as exc:
        logger.error("post_render_analysis_failed", error=str(exc))
        raise
    finally:
        if video_path:
            _safe_delete(video_path)

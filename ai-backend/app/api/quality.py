"""Quality Gates API — FEATURE-07.

POST /api/quality/analyze
  Body: { videoUrl: str }  — presigned S3 URL or direct HTTPS URL to rendered MP4
  Returns: QualityReport JSON
"""
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

from app.models.quality_report import QualityReport
from app.services.post_render_analyzer import analyze_rendered_video

router = APIRouter(prefix="/api/quality", tags=["quality"])
logger = structlog.get_logger(__name__)


class AnalyzeRequest(BaseModel):
    videoUrl: str   # presigned HTTPS URL to the rendered video


@router.post("/analyze", response_model=QualityReport)
async def analyze_video_quality(req: AnalyzeRequest) -> QualityReport:
    """Download and analyze a rendered video for quality issues.

    Called by the NestJS render worker after a successful render completes.
    Downloads from `videoUrl` (presigned S3 URL), runs FFprobe/FFmpeg checks,
    and returns a structured QualityReport with score, issues, and metrics.
    """
    logger.info("quality_analyze_request", url=req.videoUrl[:80])

    if not req.videoUrl.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=422,
            detail="videoUrl must be an HTTPS URL (presigned S3 or direct link)",
        )

    report = await analyze_rendered_video(req.videoUrl)
    return report

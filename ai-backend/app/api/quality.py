"""Quality Gates API — FEATURE-07.

POST /api/quality/analyze
  Body: { videoUrl: str }  — presigned S3 URL or direct HTTPS URL to rendered MP4
  Returns: QualityReport JSON

POST /api/quality/validate-assets
  Body: { assets: AssetToValidate[] }  — scene assets to probe via FFprobe
  Returns: AssetValidationReport JSON
"""
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.quality_report import AssetToValidate, AssetValidationReport, QualityReport
from app.services.asset_validator import validate_assets
from app.services.post_render_analyzer import analyze_rendered_video

router = APIRouter(prefix="/api/quality", tags=["quality"])
logger = structlog.get_logger(__name__)


class AnalyzeRequest(BaseModel):
    videoUrl: str   # presigned HTTPS URL to the rendered video


class ValidateAssetsRequest(BaseModel):
    assets: list[AssetToValidate]


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


@router.post("/validate-assets", response_model=AssetValidationReport)
async def validate_scene_assets(req: ValidateAssetsRequest) -> AssetValidationReport:
    """Probe scene assets via FFprobe before render dispatch.

    Called by NestJS PreRenderValidatorService. Accepts presigned HTTPS URLs —
    FFprobe reads container headers without downloading the full file.
    Returns per-asset validation results (codec, duration, format checks).
    """
    if not req.assets:
        raise HTTPException(status_code=422, detail="assets list must not be empty")

    for asset in req.assets:
        if not asset.assetUrl.startswith(("http://", "https://")):
            raise HTTPException(
                status_code=422,
                detail=f"assetUrl for scene {asset.sceneId} must be an HTTPS URL",
            )

    logger.info("validate_assets_request", count=len(req.assets))

    result = await validate_assets([a.model_dump() for a in req.assets])
    return AssetValidationReport(**result)

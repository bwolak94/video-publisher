"""Creator Mode HTTP endpoints — called by the NestJS proxy.

POST /api/creator/outline   → generates 5-point outline (plain text, one bullet per line)
POST /api/creator/storyboard → generates full VideoStoryboard from approved outline (JSON)
"""
import uuid
from typing import Optional

import structlog
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.director.prompts import build_outline_prompt, build_full_storyboard_prompt
from app.agents.director.creator_mode import _call_llm_mini, _call_llm_full, _strip_fences
from app.models.director import DEFAULT_NICHE_PROFILE, NicheProfile
from app.models.storyboard import VideoStoryboard

router = APIRouter(prefix="/api/creator", tags=["creator"])
logger = structlog.get_logger(__name__)


class OutlineRequest(BaseModel):
    topic: str
    language: str = "en"
    voiceId: str = "default"
    projectId: Optional[str] = None
    nicheProfileId: Optional[str] = None


class StoryboardRequest(BaseModel):
    outline: list[str]          # approved bullet strings from frontend
    language: str = "en"
    voiceId: str = "default"
    projectId: Optional[str] = None
    sceneCount: int = 8
    targetDurationSeconds: int = 40
    aspectRatio: str = "16:9"


@router.post("/outline")
async def generate_outline(req: OutlineRequest):
    """Generate a 5-point outline for a topic.

    Returns plain text with one bullet per line so the frontend can
    parse and display them incrementally.
    """
    profile = DEFAULT_NICHE_PROFILE

    source_chunks: list[str] = []
    if req.projectId:
        try:
            from app.rag.db import get_pool
            from app.rag.ingestion import retrieve_context
            pool = await get_pool()
            source_chunks = await retrieve_context(pool, req.projectId, req.topic)
        except Exception as exc:
            logger.warning("rag_retrieval_skipped", error=str(exc))

    prompt = build_outline_prompt(profile, req.topic, source_chunks=source_chunks)

    logger.info("creator_outline_start", topic=req.topic, language=req.language)

    raw = await _call_llm_mini(prompt)
    clean = _strip_fences(raw)

    # Parse the JSON outline array and format as plain text bullets
    import json
    try:
        items = json.loads(clean)
        bullets = [f"- {item.get('title', '')}: {item.get('keyPoint', '')}" for item in items]
        text = "\n".join(bullets)
    except (json.JSONDecodeError, AttributeError):
        # If not valid JSON, return raw text as-is
        text = clean

    logger.info("creator_outline_done", topic=req.topic, bullets=len(bullets) if 'bullets' in dir() else 0)
    return StreamingResponse(iter([text]), media_type="text/plain; charset=utf-8")


@router.post("/storyboard")
async def generate_storyboard(req: StoryboardRequest):
    """Generate a full VideoStoryboard from an approved outline.

    Returns JSON: { storyboard: VideoStoryboard, projectId: str }
    """
    profile = DEFAULT_NICHE_PROFILE

    # Convert approved bullet strings back to outline dicts
    outline_dicts = [
        {"sequenceNumber": i + 1, "title": b, "keyPoint": b}
        for i, b in enumerate(req.outline)
    ]

    source_chunks: list[str] = []
    if req.projectId:
        try:
            from app.rag.db import get_pool
            from app.rag.ingestion import retrieve_context
            pool = await get_pool()
            topic = req.outline[0] if req.outline else ""
            source_chunks = await retrieve_context(pool, req.projectId, topic)
        except Exception as exc:
            logger.warning("rag_retrieval_skipped", error=str(exc))

    prompt = build_full_storyboard_prompt(
        niche_profile=profile,
        outline=outline_dicts,
        scene_count=req.sceneCount,
        target_duration_seconds=req.targetDurationSeconds,
        aspect_ratio=req.aspectRatio,
        source_chunks=source_chunks,
    )

    logger.info("creator_storyboard_start", scene_count=req.sceneCount)
    raw = await _call_llm_full(prompt)
    clean = _strip_fences(raw)

    storyboard = VideoStoryboard.model_validate_json(clean)

    # Inject language and voiceId from request
    storyboard.meta.language = req.language  # type: ignore[assignment]
    storyboard.meta.voiceId = req.voiceId

    project_id = req.projectId or str(uuid.uuid4())
    logger.info("creator_storyboard_done", scenes=len(storyboard.timeline))

    return {"storyboard": storyboard.model_dump(), "projectId": project_id}

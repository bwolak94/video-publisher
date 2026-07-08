"""Creator Mode HTTP endpoints — called by the NestJS proxy.

POST /api/creator/research   → conducts web research and returns ResearchBrief (FEATURE-05)
POST /api/creator/outline    → generates 5-point outline (plain text, one bullet per line)
POST /api/creator/storyboard → generates full VideoStoryboard from approved outline (JSON)
"""
import uuid
from typing import Literal

import structlog
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.director.creator_mode import _call_llm_full, _call_llm_mini, _strip_fences
from app.agents.director.prompts import build_full_storyboard_prompt, build_outline_prompt
from app.agents.researcher.script_research_agent import run_script_research
from app.config import get_settings
from app.models.director import DEFAULT_NICHE_PROFILE
from app.models.reference_analysis import ReferenceAnalysisBrief
from app.models.research_brief import ResearchBrief
from app.models.storyboard import VideoStoryboard
from app.services.reference_analyzer import analyze_reference_video

router = APIRouter(prefix="/api/creator", tags=["creator"])
logger = structlog.get_logger(__name__)


class ResearchRequest(BaseModel):
    topic: str
    depth: Literal["quick", "standard", "deep"] = "standard"


class AnalyzeReferenceRequest(BaseModel):
    videoUrl: str  # YouTube URL or direct video URL


class OutlineRequest(BaseModel):
    topic: str
    language: str = "en"
    voiceId: str = "default"
    projectId: str | None = None
    nicheProfileId: str | None = None
    researchBrief: dict | None = None    # ResearchBrief JSON (FEATURE-05)
    referenceAnalysis: dict | None = None  # ReferenceAnalysisBrief JSON (FEATURE-06)


class StoryboardRequest(BaseModel):
    outline: list[str]          # approved bullet strings from frontend
    language: str = "en"
    voiceId: str = "default"
    projectId: str | None = None
    sceneCount: int = 8
    targetDurationSeconds: int = 40
    aspectRatio: str = "16:9"
    researchBrief: dict | None = None      # ResearchBrief JSON (FEATURE-05)
    referenceAnalysis: dict | None = None  # ReferenceAnalysisBrief JSON (FEATURE-06)


class PolishScriptRequest(BaseModel):
    script: str
    tone: str = "engaging"        # e.g. "engaging", "professional", "casual", "educational"
    targetDurationSeconds: int = 40
    language: str = "en"


class SuggestVisualPromptRequest(BaseModel):
    narrationText: str
    topic: str = ""
    aspectRatio: str = "16:9"


@router.post("/analyze-reference", response_model=ReferenceAnalysisBrief)
async def analyze_reference(req: AnalyzeReferenceRequest) -> ReferenceAnalysisBrief:
    """Download + analyze a reference video (YouTube or direct URL) and return ReferenceAnalysisBrief.

    Analyzes pacing, structure, tone, visual style, and transcript.
    The brief is injected into outline/storyboard prompts to inspire (not copy) the reference style.
    """
    logger.info("creator_analyze_reference_start", url=req.videoUrl)
    brief = await analyze_reference_video(req.videoUrl)
    logger.info("creator_analyze_reference_done", url=req.videoUrl, scenes=brief.sceneCount)
    return brief


@router.post("/research", response_model=ResearchBrief)
async def run_research(req: ResearchRequest) -> ResearchBrief:
    """Conduct web research before scripting and return a ResearchBrief (FEATURE-05).

    Always returns a brief — on total failure it contains minimal placeholder data
    so the outline generation can still proceed.
    """
    settings = get_settings()
    logger.info("creator_research_start", topic=req.topic, depth=req.depth)

    brief = await run_script_research(
        topic=req.topic,
        depth=req.depth,
        serpapi_key=settings.SERPAPI_KEY,
        newsapi_key=settings.NEWSAPI_KEY,
    )

    logger.info("creator_research_done", topic=req.topic, sources=len(brief.sources))
    return brief


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

    prompt = build_outline_prompt(
        profile, req.topic,
        source_chunks=source_chunks,
        research_brief=req.researchBrief,
        reference_brief=req.referenceAnalysis,
    )

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
        research_brief=req.researchBrief,
        reference_brief=req.referenceAnalysis,
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


@router.post("/polish-script")
async def polish_script(req: PolishScriptRequest):
    """Rewrite a narration script for better pacing, clarity, and engagement.

    Returns { polishedScript: str, changesSummary: str }.
    """
    prompt = (
        f"You are an expert video scriptwriter. Polish the following narration script.\n\n"
        f"Tone: {req.tone}\n"
        f"Target duration: ~{req.targetDurationSeconds}s of spoken audio\n"
        f"Language: {req.language}\n\n"
        f"Rules:\n"
        f"- Keep all key facts and messages from the original\n"
        f"- Improve sentence flow, remove filler words, and tighten phrasing\n"
        f"- Aim for natural spoken language (not written prose)\n"
        f"- Do NOT add new facts or change the meaning\n\n"
        f"Original script:\n{req.script}\n\n"
        f"Respond with a JSON object: {{ \"polishedScript\": \"...\", \"changesSummary\": \"one sentence describing main changes\" }}"
    )

    logger.info("creator_polish_script_start", tone=req.tone, chars=len(req.script))
    raw = await _call_llm_mini(prompt)
    clean = _strip_fences(raw)

    import json
    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        # Fallback: return raw as polished script
        data = {"polishedScript": clean, "changesSummary": "Script polished"}

    logger.info("creator_polish_script_done", tone=req.tone)
    return data


@router.post("/suggest-visual-prompt")
async def suggest_visual_prompt(req: SuggestVisualPromptRequest):
    """Generate a cinematic b-roll visual prompt for a scene's narration text.

    Returns { visualPrompt: str }.
    """
    aspect_note = "vertical 9:16" if req.aspectRatio == "9:16" else "widescreen 16:9"
    prompt = (
        f"You are a video director. Given a narration sentence, write a single cinematic b-roll shot description.\n\n"
        f"Narration: \"{req.narrationText}\"\n"
        f"Topic context: {req.topic or 'general'}\n"
        f"Aspect ratio: {aspect_note}\n\n"
        f"Rules:\n"
        f"- Describe a specific, visually rich scene (lighting, camera angle, action, mood)\n"
        f"- Do NOT include text overlays, subtitles, or people speaking directly to camera\n"
        f"- Keep it under 40 words\n"
        f"- Focus on B-roll (supporting footage), not talking head\n\n"
        f"Respond with a JSON object: {{ \"visualPrompt\": \"...\" }}"
    )

    logger.info("creator_suggest_visual_prompt_start", chars=len(req.narrationText))
    raw = await _call_llm_mini(prompt)
    clean = _strip_fences(raw)

    import json
    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        data = {"visualPrompt": clean.strip()}

    logger.info("creator_suggest_visual_prompt_done")
    return data

"""Creator Mode HTTP endpoints — called by the NestJS proxy.

POST /api/creator/research   → conducts web research and returns ResearchBrief (FEATURE-05)
POST /api/creator/outline    → generates 5-point outline (plain text, one bullet per line)
POST /api/creator/storyboard → generates full VideoStoryboard from approved outline (JSON)
"""
import uuid
from typing import Any, Literal

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
    researchBrief: dict[str, Any] | None = None       # ResearchBrief JSON (FEATURE-05)
    referenceAnalysis: dict[str, Any] | None = None   # ReferenceAnalysisBrief JSON (FEATURE-06)
    analyticsInsights: dict[str, Any] | None = None   # AnalyticsInsights JSON (F05)


class StoryboardRequest(BaseModel):
    outline: list[str]          # approved bullet strings from frontend
    language: str = "en"
    voiceId: str = "default"
    projectId: str | None = None
    sceneCount: int = 8
    targetDurationSeconds: int = 40
    aspectRatio: str = "16:9"
    researchBrief: dict[str, Any] | None = None       # ResearchBrief JSON (FEATURE-05)
    referenceAnalysis: dict[str, Any] | None = None   # ReferenceAnalysisBrief JSON (FEATURE-06)
    analyticsInsights: dict[str, Any] | None = None   # AnalyticsInsights JSON (F05)


class PolishScriptRequest(BaseModel):
    script: str
    tone: str = "engaging"        # e.g. "engaging", "professional", "casual", "educational"
    targetDurationSeconds: int = 40
    language: str = "en"


class SuggestVisualPromptRequest(BaseModel):
    narrationText: str
    topic: str = ""
    aspectRatio: str = "16:9"


class CloneVoiceRequest(BaseModel):
    videoUrl: str           # YouTube URL or direct video URL containing the target speaker
    voiceName: str = "cloned-voice"


class ScoreHookRequest(BaseModel):
    openingLines: str       # First ~3 seconds of narration script
    targetDurationSeconds: int = 40


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
async def generate_outline(req: OutlineRequest) -> StreamingResponse:
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
        analytics_insights=req.analyticsInsights,
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
async def generate_storyboard(req: StoryboardRequest) -> dict[str, Any]:
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
        analytics_insights=req.analyticsInsights,
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
async def polish_script(req: PolishScriptRequest) -> dict[str, Any]:
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


@router.post("/clone-voice")
async def clone_voice(req: CloneVoiceRequest) -> dict[str, Any]:
    """F01: Extract audio from a reference video and clone it via ElevenLabs Voice Add API.

    Downloads the video using yt-dlp/httpx (same pipeline as reference analyzer),
    extracts 60s of audio via ffmpeg, then creates an ElevenLabs instant voice clone.
    Returns { voiceId, voiceName } usable in storyboard.meta.voiceId.
    """
    import os
    import subprocess
    import tempfile

    import httpx

    settings = get_settings()
    if not settings.ELEVENLABS_API_KEY:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="ELEVENLABS_API_KEY not configured")

    logger.info("clone_voice_start", url=req.videoUrl, voice_name=req.voiceName)

    from app.services.video_downloader import download_reference_video

    with tempfile.TemporaryDirectory() as tmpdir:
        # Download video (reuses FEATURE-06 downloader)
        video_path = await download_reference_video(req.videoUrl)

        # Extract first 60s of audio as mp3
        audio_path = os.path.join(tmpdir, "voice_sample.mp3")
        proc = subprocess.run(
            ["ffmpeg", "-y", "-i", video_path, "-t", "60", "-vn",
             "-acodec", "libmp3lame", "-ab", "128k", audio_path],
            capture_output=True,
        )
        if proc.returncode != 0:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"ffmpeg audio extraction failed: {proc.stderr.decode()[:200]}")

        # Call ElevenLabs Voice Add API (instant voice cloning)
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            "https://api.elevenlabs.io/v1/voices/add",
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            data={"name": req.voiceName, "description": f"Cloned from {req.videoUrl[:80]}"},
            files={"files": ("voice_sample.mp3", audio_bytes, "audio/mpeg")},
        )

    if not resp.is_success:
        from fastapi import HTTPException
        raise HTTPException(status_code=resp.status_code, detail=f"ElevenLabs clone failed: {resp.text[:200]}")

    data = resp.json()
    voice_id = data.get("voice_id", "")
    logger.info("clone_voice_done", voice_id=voice_id, voice_name=req.voiceName)
    return {"voiceId": voice_id, "voiceName": req.voiceName}


@router.post("/score-hook")
async def score_hook(req: ScoreHookRequest) -> dict[str, Any]:
    """F02: Score the viral hook strength of a video's opening lines.

    Uses GPT-4o with a rubric covering:
      - Curiosity gap (0-25): Does it make the viewer wonder what comes next?
      - Pattern interrupt (0-25): Does it break from expected content?
      - Specificity (0-25): Are concrete numbers, names, or scenarios used?
      - Emotional trigger (0-25): Does it provoke curiosity, fear, desire, or surprise?

    Returns { score (0-100), breakdown, feedback[], rewrite? }.
    """
    prompt = f"""You are an expert YouTube hook analyst. Score the following opening lines.

Opening lines (first ~3 seconds of narration):
\"\"\"{req.openingLines}\"\"\"

Target video duration: {req.targetDurationSeconds}s

Rate each dimension from 0-25 and provide actionable feedback:
1. Curiosity gap: Does it make viewers wonder what comes next?
2. Pattern interrupt: Does it break from what viewers expect?
3. Specificity: Are concrete numbers, names, or scenarios used?
4. Emotional trigger: Does it provoke curiosity, fear, desire, or surprise?

Also write an improved version of the hook if score < 70.

Respond with a JSON object:
{{
  "score": <int 0-100, sum of all dimensions>,
  "breakdown": {{
    "curiosityGap": <int 0-25>,
    "patternInterrupt": <int 0-25>,
    "specificity": <int 0-25>,
    "emotionalTrigger": <int 0-25>
  }},
  "feedback": ["<actionable tip 1>", "<actionable tip 2>"],
  "rewrite": "<improved hook or null if score >= 70>"
}}"""

    logger.info("score_hook_start", chars=len(req.openingLines))
    raw = await _call_llm_mini(prompt)
    clean = _strip_fences(raw)

    import json
    data: dict[str, Any]
    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        data = {"score": 0, "breakdown": {}, "feedback": ["Could not parse hook score"], "rewrite": None}

    logger.info("score_hook_done", score=data.get("score"))
    return data


@router.post("/suggest-visual-prompt")
async def suggest_visual_prompt(req: SuggestVisualPromptRequest) -> dict[str, Any]:
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

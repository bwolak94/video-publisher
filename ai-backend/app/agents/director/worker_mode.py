"""Director Agent — Worker Mode (CrewAI).

Two-stage generation (task rule #1):
  Stage 1 (outline): gpt-4o-mini — cheap, fast
  Stage 2 (full storyboard): gpt-4o — expensive, runs only once per job

Output is validated with VideoStoryboard.model_validate_json().
A ValidationError is NOT caught here; the caller (DirectorJobHandler) handles
the retry loop (TASK-05). This keeps the function single-responsibility.
"""
import asyncio

import structlog
from crewai import Agent, Crew, Task

from app.agents.director.prompts import build_worker_prompt
from app.models.director import DEFAULT_NICHE_PROFILE, DirectorJobPayload
from app.models.storyboard import VideoStoryboard

logger = structlog.get_logger(__name__)

# Outline agent — cheap model per task rule #1
_outline_agent = Agent(
    role="Video Outline Writer",
    goal="Produce a concise 5-point outline for a YouTube video.",
    backstory="You structure compelling video narratives from news research.",
    llm="gpt-4o-mini",
    verbose=False,
    allow_delegation=False,
)

# Director agent — expensive model per task rule #1
_director_agent = Agent(
    role="YouTube Video Director",
    goal="Generate a complete, schema-valid VideoStoryboard JSON object.",
    backstory="You are a professional video director who writes precise, vivid storyboards.",
    llm="gpt-4o",
    verbose=False,
    allow_delegation=False,
)


def _strip_fences(text: str) -> str:
    """Strip markdown code fences from LLM output."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        end = -1 if lines[-1].strip() == "```" else len(lines)
        text = "\n".join(lines[1:end])
    return text


async def generate_worker_storyboard(
    payload: DirectorJobPayload,
    prior_constraints: list[str] | None = None,
) -> VideoStoryboard:
    """Generate a full VideoStoryboard for Worker Mode (Shorts, 9:16).

    Args:
        payload: Director job payload.
        prior_constraints: Accumulated QualityReviewer constraint strings from
            previous rejection cycles (TASK-05). Appended to the prompt so
            the Director knows exactly what to fix on retry.

    Raises:
        pydantic.ValidationError: if LLM output fails schema validation.
            Caller is responsible for triggering the retry loop (TASK-05).
    """
    profile = payload.nicheProfile or DEFAULT_NICHE_PROFILE
    research = payload.researchReport or {}

    prompt = build_worker_prompt(
        niche_profile=profile,
        research_report=research,
        scene_count=payload.targetSceneCount,
        target_duration_seconds=payload.targetDurationSeconds,
        prior_constraints=prior_constraints or [],
    )

    task = Task(
        description=prompt,
        agent=_director_agent,
        expected_output="A valid VideoStoryboard JSON object",
    )
    crew = Crew(agents=[_director_agent], tasks=[task], verbose=False)

    result = await asyncio.to_thread(crew.kickoff)
    raw = result.raw if hasattr(result, "raw") else str(result)
    clean = _strip_fences(raw)

    # Raises ValidationError on failure — caller handles retry (task rule #2)
    storyboard = VideoStoryboard.model_validate_json(clean)

    # Enforce Worker Mode aspect ratio (task rule #6)
    storyboard.meta.aspectRatio = "9:16"

    logger.info(
        "worker_storyboard_generated",
        channel_id=payload.channelId,
        scenes=len(storyboard.timeline),
        aspect_ratio=storyboard.meta.aspectRatio,
    )
    return storyboard

"""Director job orchestrator.

Worker Mode  → CrewAI pipeline, returns completed VideoStoryboard.
Creator Mode → LangGraph pipeline, returns outline + awaiting_approval=True.
               The caller resumes the graph after human approval.
"""
import structlog

from app.agents.director.seo import append_timestamps_to_description
from app.agents.director.worker_mode import generate_worker_storyboard
from app.models.director import DirectorJobPayload, OutlineItem, StoryboardGenerationResult

logger = structlog.get_logger(__name__)


class DirectorJobHandler:
    async def run(self, payload: DirectorJobPayload) -> StoryboardGenerationResult:
        if payload.mode == "worker":
            return await self._run_worker(payload)
        return await self._run_creator_outline(payload)

    # ── Worker Mode ────────────────────────────────────────────────────────────

    async def _run_worker(self, payload: DirectorJobPayload) -> StoryboardGenerationResult:
        try:
            storyboard = await generate_worker_storyboard(payload)

            # SEO timestamps for long-form (task rule #5)
            total_duration = sum(
                (s.durationInSeconds or 0.0) for s in storyboard.timeline
            )
            if storyboard.meta.description:
                scenes_as_dicts = [
                    {"sequenceNumber": s.sequenceNumber, "durationInSeconds": s.durationInSeconds}
                    for s in storyboard.timeline
                ]
                storyboard.meta.description = append_timestamps_to_description(
                    storyboard.meta.description,
                    scenes_as_dicts,
                    total_duration,
                )

            return StoryboardGenerationResult(
                channelId=payload.channelId,
                storyboard=storyboard.model_dump(),
            )
        except Exception as exc:
            logger.error("director_worker_failed", channel_id=payload.channelId, error=str(exc))
            return StoryboardGenerationResult(
                channelId=payload.channelId,
                error=str(exc),
            )

    # ── Creator Mode (outline stage) ───────────────────────────────────────────

    async def _run_creator_outline(self, payload: DirectorJobPayload) -> StoryboardGenerationResult:
        """Start Creator Mode: generate outline and await human approval."""
        from app.agents.director.creator_mode import get_creator_graph

        graph = await get_creator_graph()
        config = {"configurable": {"thread_id": payload.channelId}}

        initial_state = {
            "topic": payload.userPrompt or "",
            "niche_profile": payload.nicheProfile.model_dump(),
            "scene_count": payload.targetSceneCount,
            "target_duration_seconds": payload.targetDurationSeconds,
            "aspect_ratio": "16:9",
            "outline": None,
            "outline_approved": False,
            "storyboard": None,
            "error": None,
        }

        try:
            await graph.ainvoke(initial_state, config=config)

            snapshot = await graph.aget_state(config)
            state = snapshot.values

            outline_items: list[OutlineItem] = []
            for item in (state.get("outline") or []):
                try:
                    outline_items.append(OutlineItem.model_validate(item))
                except Exception:
                    pass

            return StoryboardGenerationResult(
                channelId=payload.channelId,
                outline=outline_items,
                awaitingApproval=True,
                error=state.get("error"),
            )
        except Exception as exc:
            logger.error("director_creator_outline_failed", channel_id=payload.channelId, error=str(exc))
            return StoryboardGenerationResult(
                channelId=payload.channelId,
                error=str(exc),
            )

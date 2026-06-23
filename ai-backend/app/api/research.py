"""POST /api/research/run — BullMQ research job entry point.

The Node.js BullMQ worker picks up a `research` queue job and calls this
endpoint. The Python service owns the AI/agent logic; Node.js owns the queue.
"""
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends

from app.agents.researcher.dedup import DedupService
from app.agents.researcher.job_handler import ResearchJobHandler
from app.config import get_settings
from app.models.research import ResearchJobPayload, ResearchReport

router = APIRouter(prefix="/api/research", tags=["research"])


async def _get_redis() -> aioredis.Redis:
    settings = get_settings()
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


@router.post("/run", response_model=ResearchReport)
async def run_research_job(
    payload: ResearchJobPayload,
    redis: aioredis.Redis = Depends(_get_redis),
) -> ResearchReport:
    """Accept a research job payload and run the full Researcher Agent pipeline."""
    dedup = DedupService(redis, window_hours=payload.deduplicationWindowHours)
    handler = ResearchJobHandler(dedup=dedup)
    return await handler.run(payload)

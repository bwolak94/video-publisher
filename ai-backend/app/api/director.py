"""POST /api/director/run — BullMQ director job entry point.

The Node.js BullMQ worker calls this endpoint after a Research job completes.
In Creator Mode the frontend calls this endpoint directly.
"""
from fastapi import APIRouter

from app.agents.director.job_handler import DirectorJobHandler
from app.models.director import DirectorJobPayload, StoryboardGenerationResult

router = APIRouter(prefix="/api/director", tags=["director"])

_handler = DirectorJobHandler()


@router.post("/run", response_model=StoryboardGenerationResult)
async def run_director_job(payload: DirectorJobPayload) -> StoryboardGenerationResult:
    """Accept a director job payload and run the Director Agent pipeline."""
    return await _handler.run(payload)

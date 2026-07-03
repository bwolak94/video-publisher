"""Director → QualityReviewer retry orchestrator.

PRD Section 3.3 — Retry behaviour:
  "Maximum 2 rejection cycles. On 3rd failure the job enters Dead Letter Queue
  and a human review alert is triggered. Each rejection appends the constraint
  list to the Director's next prompt (not a full reset)."

Key design decisions:
  - director_fn signature: async (payload, prior_constraints) -> VideoStoryboard
    Keeps the orchestrator framework-agnostic and easy to test.
  - ValidationError from the director counts as a rejection cycle (schema failure).
  - Any other exception (LLM timeout, network error) is re-raised without
    incrementing the attempt counter (task rule #6).
  - Attempt counter uses Redis INCR for atomicity in multi-worker environments.
  - DLQ write is injected as a callable to decouple from storage backend.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from pydantic import ValidationError

from app.agents.quality_reviewer.reviewer import QualityReviewer
from app.models.director import NicheProfile
from app.models.job import FailedJob
from app.models.storyboard import VideoStoryboard

logger = structlog.get_logger(__name__)

# Type alias for the injected director function
DirectorFn = Callable[
    ["DirectorJobPayload", list[str]],  # (payload, prior_constraints)
    Awaitable[VideoStoryboard],
]

# Import here to avoid circular; type hint only for external callers
from app.models.director import DirectorJobPayload  # noqa: E402


class DLQEscalationError(Exception):
    """Raised after MAX_ATTEMPTS exhausted — signals BullMQ to mark job failed."""

    def __init__(self, job_id: str, all_constraints: list[str]) -> None:
        self.job_id = job_id
        self.all_constraints = all_constraints
        super().__init__(
            f"Job {job_id!r} escalated to DLQ after "
            f"{DirectorRetryOrchestrator.MAX_ATTEMPTS} failed attempts."
        )


class DirectorRetryOrchestrator:
    """Wraps Director + QualityReviewer with constraint-accumulating retry logic.

    Usage::

        orchestrator = DirectorRetryOrchestrator(
            director_fn=generate_worker_storyboard,
            reviewer=QualityReviewer(),
            redis_client=redis,
        )
        storyboard = await orchestrator.run(payload, niche_profile, job_id="abc-123")
    """

    MAX_ATTEMPTS = 3  # 1 initial + 2 rejection retries (task rule #3)
    _ATTEMPT_KEY = "retry:{job_id}:attempts"

    def __init__(
        self,
        director_fn: DirectorFn,
        reviewer: QualityReviewer,
        redis_client: Any,
        dlq_writer: Callable[[FailedJob], Awaitable[None]] | None = None,
        alert_webhook_url: str | None = None,
    ) -> None:
        self._director_fn = director_fn
        self._reviewer = reviewer
        self._redis = redis_client
        self._dlq_writer = dlq_writer
        self._alert_webhook_url = alert_webhook_url

    async def run(
        self,
        payload: DirectorJobPayload,
        niche_profile: NicheProfile,
        job_id: str,
        project_id: str = "",
    ) -> VideoStoryboard:
        """Run the Director → QualityReviewer loop with retry and DLQ escalation.

        Returns:
            An APPROVED VideoStoryboard.

        Raises:
            DLQEscalationError: after MAX_ATTEMPTS failed attempts.
            Exception: any non-validation Director exception is re-raised immediately.
        """
        accumulated_constraints: list[str] = []

        for attempt in range(1, self.MAX_ATTEMPTS + 1):
            logger.info(
                "director_attempt",
                job_id=job_id,
                attempt=attempt,
                accumulated_constraints=len(accumulated_constraints),
            )

            # ── Call Director ─────────────────────────────────────────────────
            try:
                storyboard = await self._director_fn(payload, accumulated_constraints)
            except ValidationError as ve:
                # Schema failure counts as a rejection cycle (rule #6 exception carve-out)
                schema_constraints = [
                    f"Schema error: {err['msg']} at {'.'.join(str(loc) for loc in err['loc'])}"
                    for err in ve.errors()
                ]
                accumulated_constraints.extend(schema_constraints)
                await self._redis.incr(
                    self._ATTEMPT_KEY.format(job_id=job_id)
                )
                logger.warning(
                    "director_schema_failure",
                    job_id=job_id,
                    attempt=attempt,
                    errors=len(schema_constraints),
                )
                if attempt == self.MAX_ATTEMPTS:
                    await self._escalate_to_dlq(job_id, project_id, payload.channelId, accumulated_constraints)
                continue
            # Non-validation exceptions propagate without touching the counter
            except Exception:
                raise

            # ── Review ────────────────────────────────────────────────────────
            result = self._reviewer.review(storyboard, niche_profile)
            await self._redis.incr(self._ATTEMPT_KEY.format(job_id=job_id))

            if result.status == "APPROVED":
                logger.info("director_approved", job_id=job_id, attempt=attempt)
                return storyboard

            # ── Accumulate constraints (append, not replace — task rule #1) ──
            accumulated_constraints.extend(result.constraints)
            logger.warning(
                "director_rejected",
                job_id=job_id,
                attempt=attempt,
                new_constraints=result.constraints,
                total_constraints=len(accumulated_constraints),
            )

            if attempt == self.MAX_ATTEMPTS:
                await self._escalate_to_dlq(job_id, project_id, payload.channelId, accumulated_constraints)

        # Unreachable — _escalate_to_dlq always raises DLQEscalationError
        raise DLQEscalationError(job_id, accumulated_constraints)  # pragma: no cover

    # ── DLQ escalation ────────────────────────────────────────────────────────

    async def _escalate_to_dlq(
        self,
        job_id: str,
        project_id: str,
        channel_id: str,
        all_constraints: list[str],
    ) -> None:
        """Write FailedJob, log CRITICAL, fire alert webhook, raise DLQEscalationError."""
        failed_job = FailedJob(
            jobId=job_id,
            projectId=project_id,
            channelId=channel_id,
            allConstraints=all_constraints,
            attemptCount=self.MAX_ATTEMPTS,
            failedAt=datetime.now(UTC),
            alertWebhookUrl=self._alert_webhook_url,
        )

        if self._dlq_writer:
            await self._dlq_writer(failed_job)

        logger.critical(
            "dlq_escalation",
            job_id=job_id,
            project_id=project_id,
            attempt_count=self.MAX_ATTEMPTS,
            all_constraints=all_constraints,
        )

        if self._alert_webhook_url:
            await self._fire_alert(failed_job)

        raise DLQEscalationError(job_id, all_constraints)

    async def _fire_alert(self, failed_job: FailedJob) -> None:
        """POST job details to ALERT_WEBHOOK_URL. Failure is logged, not re-raised."""
        if not self._alert_webhook_url:
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    self._alert_webhook_url,
                    json={
                        "jobId": failed_job.jobId,
                        "projectId": failed_job.projectId,
                        "allConstraints": failed_job.allConstraints,
                        "failedAt": failed_job.failedAt.isoformat(),
                    },
                )
        except Exception as exc:
            logger.error("alert_webhook_failed", url=self._alert_webhook_url, error=str(exc))

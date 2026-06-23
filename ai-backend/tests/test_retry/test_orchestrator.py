"""Unit + integration tests for DirectorRetryOrchestrator — UT-05-01 through IT-05-02."""
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import fakeredis.aioredis
import pytest
from pydantic import ValidationError

from app.agents.quality_reviewer.reviewer import QualityReviewer
from app.agents.retry.orchestrator import DirectorRetryOrchestrator, DLQEscalationError
from app.models.director import DirectorJobPayload, NicheProfile
from app.models.job import FailedJob
from app.models.storyboard import Scene, StoryboardMeta, VideoStoryboard


# ── Fixtures & helpers ─────────────────────────────────────────────────────────

@pytest.fixture
def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.fixture
def reviewer():
    return QualityReviewer()


def _profile(target_scenes: int = 7, target_duration: int = 42) -> NicheProfile:
    return NicheProfile(targetSceneCount=target_scenes, targetDurationSeconds=target_duration)


def _payload() -> DirectorJobPayload:
    return DirectorJobPayload(
        channelId="chan-test",
        mode="worker",
        researchReport={"selectedTopic": "AI beats experts"},
    )


def _good_storyboard(scene_count: int = 7, duration_each: float = 6.0) -> VideoStoryboard:
    """Storyboard that passes all QualityReviewer checks."""
    scenes = []
    for i in range(scene_count - 1):
        scenes.append(Scene(
            sequenceNumber=i + 1,
            narrationText="This is detailed narration text for the scene explaining the topic.",
            visualPrompt="A vivid and detailed visual scene showing the main subject in action clearly.",
            durationInSeconds=duration_each,
        ))
    # Last scene with CTA
    scenes.append(Scene(
        sequenceNumber=scene_count,
        narrationText="Please subscribe and follow for more AI content like this.",
        visualPrompt="A bright call-to-action screen with subscribe button clearly visible on display.",
        durationInSeconds=duration_each,
    ))
    return VideoStoryboard(
        meta=StoryboardMeta(
            title="AI Beats Every Expert",
            aspectRatio="9:16",
            language="en",
            voiceId="voice-001",
        ),
        timeline=scenes,
    )


def _bad_storyboard() -> VideoStoryboard:
    """Storyboard that fails QualityReviewer checks (no CTA, short prompt)."""
    return VideoStoryboard(
        meta=StoryboardMeta(
            title="Bad Storyboard",
            aspectRatio="9:16",
            language="en",
            voiceId="voice-001",
        ),
        timeline=[
            Scene(
                sequenceNumber=1,
                narrationText="Just some narration without any call to action at the end.",
                visualPrompt="Bad prompt",  # < 10 words → QC-06
                durationInSeconds=6.0,
            )
        ],
    )


def _make_orchestrator(
    director_fn,
    reviewer: QualityReviewer,
    fake_redis,
    dlq_writer=None,
    alert_webhook_url=None,
) -> DirectorRetryOrchestrator:
    return DirectorRetryOrchestrator(
        director_fn=director_fn,
        reviewer=reviewer,
        redis_client=fake_redis,
        dlq_writer=dlq_writer,
        alert_webhook_url=alert_webhook_url,
    )


# ─── UT-05-01: First attempt passes → no retry ────────────────────────────────

async def test_first_attempt_passes_no_retry(reviewer, fake_redis):
    """UT-05-01: Director returns valid storyboard on first try → returned immediately."""
    call_count = 0

    async def director_fn(payload, prior_constraints):
        nonlocal call_count
        call_count += 1
        return _good_storyboard()

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)
    result = await orch.run(_payload(), _profile(), job_id="job-001")

    assert call_count == 1
    assert result.meta.title == "AI Beats Every Expert"


# ─── UT-05-02: First rejected, second passes ─────────────────────────────────

async def test_rejected_once_then_passes(reviewer, fake_redis):
    """UT-05-02: Director fails QC on cycle 1, passes on cycle 2 → storyboard returned."""
    call_count = 0

    async def director_fn(payload, prior_constraints):
        nonlocal call_count
        call_count += 1
        return _bad_storyboard() if call_count == 1 else _good_storyboard()

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)
    result = await orch.run(_payload(), _profile(), job_id="job-002")

    assert call_count == 2
    assert isinstance(result, VideoStoryboard)


# ─── UT-05-03: Always fails → DLQEscalationError after 3 attempts ────────────

async def test_always_fails_raises_dlq_error(reviewer, fake_redis):
    """UT-05-03: Director always returns invalid storyboard → DLQEscalationError."""
    call_count = 0

    async def director_fn(payload, prior_constraints):
        nonlocal call_count
        call_count += 1
        return _bad_storyboard()

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)

    with pytest.raises(DLQEscalationError) as exc_info:
        await orch.run(_payload(), _profile(), job_id="job-003")

    assert call_count == DirectorRetryOrchestrator.MAX_ATTEMPTS
    assert exc_info.value.job_id == "job-003"


# ─── UT-05-04: Cycle 1 constraint appears in cycle 2 call ────────────────────

async def test_cycle1_constraint_in_cycle2_call(reviewer, fake_redis):
    """UT-05-04: prior_constraints passed to cycle 2 includes cycle 1 failures."""
    received_constraints: list[list[str]] = []

    async def director_fn(payload, prior_constraints):
        received_constraints.append(list(prior_constraints))
        return _bad_storyboard() if len(received_constraints) == 1 else _good_storyboard()

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)
    await orch.run(_payload(), _profile(), job_id="job-004")

    # First call: no prior constraints
    assert received_constraints[0] == []
    # Second call: contains constraints from cycle 1
    assert len(received_constraints[1]) > 0
    assert any("visualPrompt" in c or "call-to-action" in c for c in received_constraints[1])


# ─── UT-05-05: Constraints accumulate across both rejection cycles ─────────────

async def test_constraints_accumulate_across_cycles(reviewer, fake_redis):
    """UT-05-05: Cycle 3 prompt includes constraints from cycles 1 and 2."""
    received_constraints: list[list[str]] = []

    async def director_fn(payload, prior_constraints):
        received_constraints.append(list(prior_constraints))
        return _bad_storyboard()  # Always fail → goes to DLQ

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)

    with pytest.raises(DLQEscalationError):
        await orch.run(_payload(), _profile(), job_id="job-005")

    # Cycle 1: no prior constraints
    assert received_constraints[0] == []
    # Cycle 2: constraints from cycle 1
    assert len(received_constraints[1]) > 0
    # Cycle 3: constraints from BOTH cycles 1 and 2 (accumulated, not replaced)
    assert len(received_constraints[2]) > len(received_constraints[1])


# ─── UT-05-06: Attempt counter uses Redis INCR ────────────────────────────────

async def test_attempt_counter_incremented_per_cycle(reviewer, fake_redis):
    """UT-05-06: After one rejection and one pass, Redis counter = 2."""
    call_count = 0

    async def director_fn(payload, prior_constraints):
        nonlocal call_count
        call_count += 1
        return _bad_storyboard() if call_count == 1 else _good_storyboard()

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)
    await orch.run(_payload(), _profile(), job_id="job-006")

    counter = await fake_redis.get("retry:job-006:attempts")
    assert int(counter) == 2


# ─── UT-05-07: LLM timeout exception propagates, counter NOT incremented ──────

async def test_llm_timeout_propagates_without_incrementing_counter(reviewer, fake_redis):
    """UT-05-07: Director raises TimeoutError → propagates, counter stays 0."""

    async def director_fn(payload, prior_constraints):
        raise TimeoutError("LLM request timed out")

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)

    with pytest.raises(TimeoutError):
        await orch.run(_payload(), _profile(), job_id="job-007")

    # Counter must NOT be incremented — timeout is not a rejection cycle
    counter = await fake_redis.get("retry:job-007:attempts")
    assert counter is None


# ─── UT-05-08: DLQ escalation writes FailedJob ────────────────────────────────

async def test_dlq_escalation_writes_failed_job(reviewer, fake_redis):
    """UT-05-08: On DLQ escalation, dlq_writer called with accumulated constraints."""
    written_jobs: list[FailedJob] = []

    async def mock_dlq_writer(failed_job: FailedJob) -> None:
        written_jobs.append(failed_job)

    async def director_fn(payload, prior_constraints):
        return _bad_storyboard()

    orch = _make_orchestrator(
        director_fn, reviewer, fake_redis, dlq_writer=mock_dlq_writer
    )

    with pytest.raises(DLQEscalationError):
        await orch.run(_payload(), _profile(), job_id="job-008", project_id="proj-A")

    assert len(written_jobs) == 1
    fj = written_jobs[0]
    assert fj.jobId == "job-008"
    assert fj.projectId == "proj-A"
    assert len(fj.allConstraints) > 0
    assert fj.attemptCount == DirectorRetryOrchestrator.MAX_ATTEMPTS


# ─── IT-05-01: Full loop — Director fails twice → DLQ, CRITICAL logged ────────

async def test_full_loop_two_rejections_dlq_escalation(reviewer, fake_redis, caplog):
    """IT-05-01: Real QualityReviewer, Director mocked to fail twice → DLQ fires."""
    import logging

    dlq_calls: list[FailedJob] = []

    async def director_fn(payload, prior_constraints):
        return _bad_storyboard()  # Always fails QC

    orch = _make_orchestrator(
        director_fn,
        reviewer,
        fake_redis,
        dlq_writer=AsyncMock(side_effect=lambda fj: dlq_calls.append(fj)),
    )

    with pytest.raises(DLQEscalationError) as exc_info:
        await orch.run(_payload(), _profile(), job_id="job-it-01", project_id="proj-it")

    # DLQ escalated with all collected constraints
    assert len(dlq_calls) == 1
    assert len(dlq_calls[0].allConstraints) > 0
    assert exc_info.value.job_id == "job-it-01"

    # Redis counter reflects 3 attempts
    counter = await fake_redis.get("retry:job-it-01:attempts")
    assert int(counter) == DirectorRetryOrchestrator.MAX_ATTEMPTS


# ─── IT-05-02: Full loop — Director passes on cycle 2 → valid storyboard ──────

async def test_full_loop_passes_on_cycle_2(reviewer, fake_redis):
    """IT-05-02: Real QualityReviewer, Director passes on cycle 2 → storyboard returned."""
    call_count = 0

    async def director_fn(payload, prior_constraints):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return _bad_storyboard()  # Fails QC
        return _good_storyboard()  # Passes QC

    orch = _make_orchestrator(director_fn, reviewer, fake_redis)
    storyboard = await orch.run(_payload(), _profile(), job_id="job-it-02")

    assert isinstance(storyboard, VideoStoryboard)
    assert call_count == 2

    # Counter = 2 (one rejection + one approval)
    counter = await fake_redis.get("retry:job-it-02:attempts")
    assert int(counter) == 2


# ─── Constraint block injection ───────────────────────────────────────────────

def test_build_constraint_block_empty():
    """Empty constraints → empty string (no block injected)."""
    from app.agents.director.prompts import build_constraint_block
    assert build_constraint_block([]) == ""


def test_build_constraint_block_numbered():
    """Constraints are numbered and include the template header."""
    from app.agents.director.prompts import build_constraint_block
    block = build_constraint_block(["Scene count must be 7±1. Got 5.", "No CTA in last scene."])
    assert "1. Scene count must be 7±1. Got 5." in block
    assert "2. No CTA in last scene." in block
    assert "PREVIOUS REJECTION CONSTRAINTS" in block


def test_build_worker_prompt_injects_constraints():
    """build_worker_prompt appends constraint block when prior_constraints provided."""
    from app.agents.director.prompts import build_worker_prompt
    prompt = build_worker_prompt(
        niche_profile=NicheProfile(),
        research_report={},
        scene_count=7,
        target_duration_seconds=40,
        prior_constraints=["Scene count must be 7±1. Got 5."],
    )
    assert "PREVIOUS REJECTION CONSTRAINTS" in prompt
    assert "Scene count must be 7±1. Got 5." in prompt

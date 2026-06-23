"""Unit + integration tests for Director Worker Mode — UT-03-06, IT-03-01, IT-03-02."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from app.agents.director.job_handler import DirectorJobHandler
from app.models.director import DirectorJobPayload, NicheProfile
from app.models.storyboard import VideoStoryboard


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_payload(**kwargs) -> DirectorJobPayload:
    defaults = {
        "channelId": "chan-test",
        "mode": "worker",
        "researchReport": {
            "selectedTopic": "AI beats experts",
            "keyFacts": ["AI is improving rapidly"],
            "sourceUrls": ["https://example.com/article"],
            "rawSummary": "A new AI system has surpassed human experts.",
        },
        "nicheProfile": NicheProfile(
            name="tech",
            tone="informative",
            hookPattern="opens with a question",
        ),
        "targetSceneCount": 6,
        "targetDurationSeconds": 40,
    }
    defaults.update(kwargs)
    return DirectorJobPayload(**defaults)


def _valid_storyboard_json(aspect_ratio: str = "9:16") -> str:
    return json.dumps({
        "meta": {
            "title": "AI Just Beat Every Human Expert",
            "aspectRatio": aspect_ratio,
            "language": "en",
            "voiceId": "voice-001",
            "description": "In this Short we explain how AI is advancing.",
        },
        "timeline": [
            {
                "sequenceNumber": i + 1,
                "narrationText": f"Scene {i + 1} narration text here.",
                "visualPrompt": f"A dramatic visual showing AI advancement in scene {i + 1} with depth.",
                "durationInSeconds": 7,
            }
            for i in range(6)
        ],
    })


# ─── UT-03-06: Worker Mode storyboard sets aspectRatio = "9:16" ──────────────

async def test_worker_mode_sets_aspect_ratio_9_16():
    """UT-03-06: generate_worker_storyboard always sets aspectRatio = '9:16'."""
    # LLM returns 16:9 — handler must override to 9:16
    llm_output = _valid_storyboard_json(aspect_ratio="16:9")

    mock_result = MagicMock()
    mock_result.raw = llm_output

    with patch(
        "app.agents.director.worker_mode.asyncio.to_thread",
        new=AsyncMock(return_value=mock_result),
    ):
        from app.agents.director.worker_mode import generate_worker_storyboard
        storyboard = await generate_worker_storyboard(_make_payload())

    assert storyboard.meta.aspectRatio == "9:16"


# ─── IT-03-01: Worker Mode happy path → valid VideoStoryboard returned ────────

async def test_worker_mode_returns_valid_storyboard():
    """IT-03-01: Mocked LLM returns valid JSON → DirectorJobHandler returns result."""
    handler = DirectorJobHandler()
    payload = _make_payload()

    mock_result = MagicMock()
    mock_result.raw = _valid_storyboard_json()

    with patch(
        "app.agents.director.worker_mode.asyncio.to_thread",
        new=AsyncMock(return_value=mock_result),
    ):
        result = await handler.run(payload)

    assert result.error is None
    assert result.storyboard is not None
    # Validate the storyboard is schema-valid
    VideoStoryboard.model_validate(result.storyboard)
    assert result.storyboard["meta"]["aspectRatio"] == "9:16"


# ─── IT-03-02: LLM returns malformed JSON → ValidationError raised ────────────

async def test_worker_mode_malformed_json_triggers_validation_error():
    """IT-03-02: Malformed LLM output → handler returns error (retry path)."""
    handler = DirectorJobHandler()
    payload = _make_payload()

    mock_result = MagicMock()
    mock_result.raw = "This is definitely not valid JSON { broken }"

    with patch(
        "app.agents.director.worker_mode.asyncio.to_thread",
        new=AsyncMock(return_value=mock_result),
    ):
        result = await handler.run(payload)

    # Handler catches the ValidationError/JSONDecodeError and returns it as error field
    assert result.error is not None
    assert result.storyboard is None


async def test_worker_mode_title_over_100_chars_fails_validation():
    """IT-03-02 variant: LLM returns title > 100 chars → validation error path."""
    handler = DirectorJobHandler()
    payload = _make_payload()

    storyboard_data = json.loads(_valid_storyboard_json())
    storyboard_data["meta"]["title"] = "X" * 101

    mock_result = MagicMock()
    mock_result.raw = json.dumps(storyboard_data)

    with patch(
        "app.agents.director.worker_mode.asyncio.to_thread",
        new=AsyncMock(return_value=mock_result),
    ):
        result = await handler.run(payload)

    assert result.error is not None
    assert result.storyboard is None

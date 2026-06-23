"""Unit tests for VideoStoryboard validation in Director context — UT-03-03, UT-03-04."""
import json

import pytest
from pydantic import ValidationError

from app.models.storyboard import VideoStoryboard


def _minimal_storyboard_dict(title: str = "AI Beats Chess") -> dict:
    return {
        "meta": {
            "title": title,
            "aspectRatio": "9:16",
            "language": "en",
            "voiceId": "voice-001",
        },
        "timeline": [
            {
                "sequenceNumber": 1,
                "narrationText": "AI just beat every chess grandmaster.",
                "visualPrompt": "Close-up of a chessboard with a robotic hand moving a piece.",
            }
        ],
    }


# ─── UT-03-03: Valid LLM output parses successfully ───────────────────────────

def test_storyboard_model_validate_json_valid():
    """UT-03-03: model_validate_json() on valid LLM output parses successfully."""
    raw_json = json.dumps(_minimal_storyboard_dict())
    storyboard = VideoStoryboard.model_validate_json(raw_json)

    assert storyboard.meta.title == "AI Beats Chess"
    assert len(storyboard.timeline) == 1
    assert storyboard.meta.aspectRatio == "9:16"


def test_storyboard_model_validate_dict_valid():
    """UT-03-03 (dict variant): model_validate() also works on valid dict."""
    storyboard = VideoStoryboard.model_validate(_minimal_storyboard_dict())
    assert storyboard.meta.voiceId == "voice-001"


# ─── UT-03-04: Title > 100 chars raises ValidationError ──────────────────────

def test_storyboard_title_over_100_chars_raises():
    """UT-03-04: title > 100 chars → ValidationError (task rule #4 hard limit)."""
    long_title = "A" * 101
    data = _minimal_storyboard_dict(title=long_title)

    with pytest.raises(ValidationError) as exc_info:
        VideoStoryboard.model_validate(data)

    errors = exc_info.value.errors()
    assert any("title" in str(e["loc"]) for e in errors)


def test_storyboard_title_exactly_100_chars_valid():
    """Boundary: title of exactly 100 chars is accepted."""
    title = "T" * 100
    storyboard = VideoStoryboard.model_validate(_minimal_storyboard_dict(title=title))
    assert len(storyboard.meta.title) == 100


def test_storyboard_empty_timeline_raises():
    """PRD: timeline must have at least 1 scene."""
    data = _minimal_storyboard_dict()
    data["timeline"] = []

    with pytest.raises(ValidationError):
        VideoStoryboard.model_validate(data)

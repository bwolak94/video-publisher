"""Unit tests for VideoStoryboard Pydantic models.

Covers UT-01-01 through UT-01-08.
"""

import pytest
from pydantic import ValidationError

from app.models.storyboard import Scene, VideoStoryboard

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def minimal_scene(**overrides) -> dict:
    base = {
        "sceneId": "123e4567-e89b-12d3-a456-426614174000",
        "sequenceNumber": 1,
        "narrationText": "This is narration text.",
        "visualPrompt": "A cinematic wide shot of a city skyline at dusk.",
    }
    return {**base, **overrides}


def minimal_storyboard(**meta_overrides) -> dict:
    return {
        "meta": {
            "title": "Test Video",
            "aspectRatio": "9:16",
            "language": "en",
            "voiceId": "voice_abc123",
            **meta_overrides,
        },
        "timeline": [minimal_scene()],
    }


# ---------------------------------------------------------------------------
# UT-01-01: Valid minimal payload parses without error
# ---------------------------------------------------------------------------

def test_valid_minimal_storyboard():
    sb = VideoStoryboard.model_validate(minimal_storyboard())
    assert sb.meta.title == "Test Video"
    assert len(sb.timeline) == 1


# ---------------------------------------------------------------------------
# UT-01-02: title > 100 chars raises ValidationError
# ---------------------------------------------------------------------------

def test_title_too_long():
    with pytest.raises(ValidationError) as exc_info:
        VideoStoryboard.model_validate(minimal_storyboard(title="A" * 101))
    errors = exc_info.value.errors()
    assert any("title" in str(e["loc"]) for e in errors)


# ---------------------------------------------------------------------------
# UT-01-03: Empty timeline raises ValidationError (minItems: 1)
# ---------------------------------------------------------------------------

def test_empty_timeline():
    data = minimal_storyboard()
    data["timeline"] = []
    with pytest.raises(ValidationError) as exc_info:
        VideoStoryboard.model_validate(data)
    errors = exc_info.value.errors()
    assert any("timeline" in str(e["loc"]) for e in errors)


# ---------------------------------------------------------------------------
# UT-01-04: sequenceNumber = 0 raises ValidationError (minimum: 1)
# ---------------------------------------------------------------------------

def test_scene_sequence_number_zero():
    with pytest.raises(ValidationError) as exc_info:
        Scene.model_validate(minimal_scene(sequenceNumber=0))
    errors = exc_info.value.errors()
    assert any("sequenceNumber" in str(e["loc"]) for e in errors)


# ---------------------------------------------------------------------------
# UT-01-05: aspectRatio = "4:3" raises ValidationError
# ---------------------------------------------------------------------------

def test_invalid_aspect_ratio():
    with pytest.raises(ValidationError) as exc_info:
        VideoStoryboard.model_validate(minimal_storyboard(aspectRatio="4:3"))
    errors = exc_info.value.errors()
    assert any("aspectRatio" in str(e["loc"]) for e in errors)


# ---------------------------------------------------------------------------
# UT-01-06: visualPrompt < 10 words does NOT raise at model level
# (word-count check is the QualityReviewer's responsibility — TASK-04)
# ---------------------------------------------------------------------------

def test_short_visual_prompt_is_allowed():
    scene = Scene.model_validate(minimal_scene(visualPrompt="Short prompt"))
    assert scene.visualPrompt == "Short prompt"


# ---------------------------------------------------------------------------
# UT-01-07: Settings with all required env vars set — instantiates OK
# ---------------------------------------------------------------------------

def test_settings_valid(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-valid")
    from app.config import Settings
    s = Settings()
    assert s.OPENAI_API_KEY == "sk-test-valid"


# ---------------------------------------------------------------------------
# UT-01-08: Settings missing OPENAI_API_KEY raises ValidationError
# ---------------------------------------------------------------------------

def test_settings_missing_openai_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from app.config import Settings
    with pytest.raises(ValidationError) as exc_info:
        Settings()
    errors = exc_info.value.errors()
    assert any("OPENAI_API_KEY" in str(e["loc"]) for e in errors)

"""Unit tests for QualityReviewer — UT-04-01 through UT-04-10."""
import pytest

from app.agents.quality_reviewer.reviewer import QualityReviewer
from app.models.director import NicheProfile
from app.models.storyboard import Scene, StoryboardMeta, TextOverlay, VideoStoryboard


# ── Fixtures & Helpers ─────────────────────────────────────────────────────────

def _profile(
    target_scene_count: int = 7,
    target_duration_seconds: int = 40,
    tone: str = "informative",
) -> NicheProfile:
    return NicheProfile(
        targetSceneCount=target_scene_count,
        targetDurationSeconds=target_duration_seconds,
        tone=tone,
    )


def _scene(
    seq: int,
    narration: str = "This is the narration text for the scene.",
    visual_prompt: str = "A detailed and vivid visual scene showing the subject clearly in action.",
    duration: float = 6.0,
    text_overlay: TextOverlay | None = None,
) -> Scene:
    return Scene(
        sequenceNumber=seq,
        narrationText=narration,
        visualPrompt=visual_prompt,
        durationInSeconds=duration,
        textOverlay=text_overlay,
    )


def _cta_scene(seq: int) -> Scene:
    return _scene(seq, narration="Please subscribe and follow for more content like this.")


def _storyboard(scenes: list[Scene], tone_profile: str | None = None) -> VideoStoryboard:
    return VideoStoryboard(
        meta=StoryboardMeta(
            title="Test Video Title",
            aspectRatio="9:16",
            language="en",
            voiceId="voice-001",
            toneProfile=tone_profile,
        ),
        timeline=scenes,
    )


_reviewer = QualityReviewer()


# ─── UT-04-01: All checks pass → APPROVED ────────────────────────────────────

def test_all_checks_pass_approved():
    """UT-04-01: Valid storyboard with 7 scenes, 42s total, CTA, good prompts → APPROVED."""
    scenes = [_scene(i + 1, duration=6.0) for i in range(6)] + [_cta_scene(7)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_scene_count=7, target_duration_seconds=40))

    assert result.status == "APPROVED"
    assert result.constraints == []


# ─── UT-04-02: Scene count = target - 2 → REJECTED (QC-02) ──────────────────

def test_scene_count_too_low_rejected():
    """UT-04-02: 5 scenes when target is 7 (±1 = 6–8) → QC-02 REJECTED."""
    scenes = [_scene(i + 1, duration=6.0) for i in range(4)] + [_cta_scene(5)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_scene_count=7))

    assert result.status == "REJECTED"
    assert any("Scene count must be 7±1" in c for c in result.constraints)
    assert any("Got 5" in c for c in result.constraints)


def test_scene_count_at_boundary_accepted():
    """target ±1 is accepted: target=7, actual=6 → APPROVED."""
    scenes = [_scene(i + 1, duration=6.0) for i in range(5)] + [_cta_scene(6)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_scene_count=7, target_duration_seconds=36))

    assert result.status == "APPROVED"


# ─── UT-04-03: Last scene has no CTA → REJECTED (QC-03) ──────────────────────

def test_no_cta_in_last_scene_rejected():
    """UT-04-03: Last scene has no CTA keyword → QC-03 REJECTED."""
    scenes = [_scene(i + 1) for i in range(7)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile())

    assert result.status == "REJECTED"
    assert any("call-to-action" in c for c in result.constraints)


def test_cta_in_text_overlay_accepted():
    """CTA in textOverlay.text (not narration) also satisfies QC-03."""
    overlay = TextOverlay(text="Subscribe now!", style="punchy")
    scenes = [_scene(i + 1) for i in range(6)] + [_scene(7, text_overlay=overlay)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_duration_seconds=42))

    assert result.status == "APPROVED"


# ─── UT-04-04: Total duration 50% over target → REJECTED (QC-05) ─────────────

def test_duration_50_percent_over_rejected():
    """UT-04-04: 60s total, target=40s (±15% = 34–46s) → QC-05 REJECTED."""
    scenes = [_scene(i + 1, duration=8.57) for i in range(6)] + [_cta_scene(7)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_duration_seconds=40))

    assert result.status == "REJECTED"
    assert any("Total duration must be" in c for c in result.constraints)


def test_duration_within_15_percent_approved():
    """Duration within ±15% passes QC-05: target=40s, 42s is within 34–46s."""
    scenes = [_scene(i + 1, duration=6.0) for i in range(6)] + [_cta_scene(7)]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_duration_seconds=40))

    assert result.status == "APPROVED"


# ─── UT-04-05: Visual prompt 2 words → REJECTED (QC-06) ─────────────────────

def test_visual_prompt_too_short_rejected():
    """UT-04-05: visualPrompt = 'A man' (2 words) → QC-06 REJECTED per-scene."""
    scenes = [
        _scene(i + 1) for i in range(6)
    ] + [_cta_scene(7)]
    # Override scene 3 with a short prompt
    scenes[2] = _scene(3, visual_prompt="A man")
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile())

    assert result.status == "REJECTED"
    assert any("Scene 3 visualPrompt" in c for c in result.constraints)


# ─── UT-04-06: Placeholder visual prompt → REJECTED (QC-06) ──────────────────

def test_visual_prompt_placeholder_rejected():
    """UT-04-06: visualPrompt = '[ADD IMAGE HERE]' → QC-06 REJECTED."""
    scenes = [
        _scene(i + 1) for i in range(6)
    ] + [_cta_scene(7)]
    scenes[4] = _scene(5, visual_prompt="[ADD IMAGE HERE]")
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile())

    assert result.status == "REJECTED"
    assert any("Scene 5 visualPrompt" in c for c in result.constraints)


def test_visual_prompt_tbd_rejected():
    """Placeholder keyword 'TBD' triggers QC-06."""
    scenes = [
        _scene(i + 1) for i in range(6)
    ] + [_cta_scene(7)]
    scenes[1] = _scene(2, visual_prompt="TBD")
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile())

    assert result.status == "REJECTED"
    assert any("Scene 2 visualPrompt" in c for c in result.constraints)


# ─── UT-04-07: Tone mismatch → APPROVED + warning logged ─────────────────────

def test_tone_mismatch_approved_with_warning():
    """UT-04-07: Comedic profile, formal narration → APPROVED (QC-04 warn only)."""
    scenes = [_scene(i + 1) for i in range(6)] + [_cta_scene(7)]
    board = _storyboard(scenes, tone_profile="comedic")
    result = _reviewer.review(board, _profile(tone="comedic"))

    # Must not be blocked — QC-04 is WARN only
    assert result.status == "APPROVED"
    assert result.constraints == []
    assert len(result.warnings) >= 1
    assert any("comedic" in w.lower() for w in result.warnings)


# ─── UT-04-08: Multiple failures → all collected in one pass ──────────────────

def test_multiple_violations_all_collected():
    """UT-04-08: Scene count, CTA, and one bad prompt → all three in constraints."""
    # 5 scenes, target=7 → QC-02
    scenes = [_scene(i + 1) for i in range(4)] + [_scene(5)]  # no CTA → QC-03
    # Set scene 3 to short prompt → QC-06
    scenes[2] = _scene(3, visual_prompt="Bad prompt")

    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile(target_scene_count=7, target_duration_seconds=30))

    assert result.status == "REJECTED"
    # QC-02: scene count
    assert any("Scene count must be 7±1" in c for c in result.constraints)
    # QC-03: no CTA
    assert any("call-to-action" in c for c in result.constraints)
    # QC-06: bad prompt
    assert any("Scene 3 visualPrompt" in c for c in result.constraints)
    # All three, not just the first
    assert len(result.constraints) >= 3


# ─── UT-04-09: CTA keyword case-insensitive ───────────────────────────────────

def test_cta_case_insensitive():
    """UT-04-09: 'SUBSCRIBE' (uppercase) satisfies QC-03 case-insensitively."""
    scenes = [_scene(i + 1) for i in range(6)] + [
        _scene(7, narration="SUBSCRIBE FOR MORE VIDEOS EVERY DAY!")
    ]
    board = _storyboard(scenes)
    result = _reviewer.review(board, _profile())

    assert result.status == "APPROVED"


# ─── UT-04-10: Empty timeline → REJECTED (QC-01 or QC-02) ───────────────────

def test_empty_timeline_rejected():
    """UT-04-10: Empty timeline bypassed Pydantic via model_construct → QC-01 rejects."""
    meta = StoryboardMeta(
        title="Test",
        aspectRatio="9:16",
        language="en",
        voiceId="v",
    )
    # model_construct skips Pydantic min_length=1 validation
    board = VideoStoryboard.model_construct(meta=meta, timeline=[])
    result = _reviewer.review(board, _profile())

    assert result.status == "REJECTED"
    # QC-01 or QC-02 must trigger
    assert len(result.constraints) >= 1

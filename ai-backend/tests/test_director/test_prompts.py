"""Unit tests for Director Agent prompt builder — UT-03-01, UT-03-02, UT-06-01, UT-06-02."""
from app.agents.director.prompts import build_worker_prompt, build_outline_prompt, build_full_storyboard_prompt
from app.models.director import DEFAULT_NICHE_PROFILE, NicheProfile


# ─── UT-03-01: Prompt includes NicheProfile block ─────────────────────────────

def test_worker_prompt_includes_niche_profile():
    """UT-03-01: build_worker_prompt embeds NicheProfile in <niche_profile> block."""
    profile = NicheProfile(
        name="tech",
        toneProfile="edgy",
        hookPattern="opens with a shocking statistic",
        visualVocabulary=["dark background", "neon"],
    )
    prompt = build_worker_prompt(
        niche_profile=profile,
        research_report={"selectedTopic": "AI beats chess"},
        scene_count=8,
        target_duration_seconds=40,
    )

    assert "<niche_profile>" in prompt
    assert "tech" in prompt
    assert "opens with a shocking statistic" in prompt
    assert "edgy" in prompt


def test_outline_prompt_includes_niche_profile():
    """UT-03-01 (outline variant): build_outline_prompt also embeds NicheProfile."""
    profile = NicheProfile(name="finance", hookPattern="opens with a shocking statistic")
    prompt = build_outline_prompt(niche_profile=profile, topic="SVB collapse")

    assert "<niche_profile>" in prompt
    assert "finance" in prompt
    assert "SVB collapse" in prompt


# ─── UT-03-02: Missing profile → default profile applied, no KeyError ─────────

def test_worker_prompt_default_profile_no_error():
    """UT-03-02: build_worker_prompt with DEFAULT_NICHE_PROFILE raises no errors."""
    prompt = build_worker_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        research_report={},
        scene_count=6,
        target_duration_seconds=40,
    )

    assert "<niche_profile>" in prompt
    assert DEFAULT_NICHE_PROFILE.name in prompt
    assert DEFAULT_NICHE_PROFILE.hookPattern in prompt


def test_outline_prompt_default_profile_no_error():
    """UT-03-02 (outline variant): default profile is safe to use in outline prompt."""
    prompt = build_outline_prompt(niche_profile=DEFAULT_NICHE_PROFILE, topic="any topic")

    assert "<niche_profile>" in prompt
    assert "any topic" in prompt


# ─── UT-06-01: Reference brief injects <reference_analysis> block ─────────────

SAMPLE_REFERENCE_BRIEF = {
    "sourceUrl": "https://youtube.com/watch?v=abc",
    "totalDurationSeconds": 120.0,
    "sceneCount": 10,
    "avgSceneDurationSeconds": 12.0,
    "pacing": "fast",
    "toneProfile": "educational",
    "structurePattern": "hook → problem → solution → cta",
    "transcript": "Sample transcript text",
    "keyTopics": ["AI", "machine learning"],
    "visualStyle": "talking head with b-roll",
    "audioAnalysis": {"hasMusic": True, "hasSpeech": True, "avgLoudnessLUFS": -18.0},
}


def test_outline_prompt_with_reference_brief_injects_block():
    """UT-06-01: build_outline_prompt injects <reference_analysis> block when brief given."""
    prompt = build_outline_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        topic="AI productivity tips",
        reference_brief=SAMPLE_REFERENCE_BRIEF,
    )

    assert "<reference_analysis>" in prompt
    assert "hook → problem → solution → cta" in prompt
    assert "fast" in prompt
    assert "educational" in prompt
    assert "talking head with b-roll" in prompt
    assert "AI" in prompt


def test_outline_prompt_without_reference_brief_no_block():
    """UT-06-01 (negative): build_outline_prompt omits reference block when no brief."""
    prompt = build_outline_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        topic="some topic",
        reference_brief=None,
    )

    assert "<reference_analysis>" not in prompt


def test_storyboard_prompt_with_reference_brief_injects_block():
    """UT-06-02: build_full_storyboard_prompt injects reference analysis block."""
    outline = [
        {"sequenceNumber": 1, "title": "Intro", "keyPoint": "Hook the audience"},
        {"sequenceNumber": 2, "title": "Outro", "keyPoint": "CTA"},
    ]
    prompt = build_full_storyboard_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        outline=outline,
        scene_count=8,
        target_duration_seconds=40,
        reference_brief=SAMPLE_REFERENCE_BRIEF,
    )

    assert "<reference_analysis>" in prompt
    assert "hook → problem → solution → cta" in prompt
    assert "fast" in prompt


def test_storyboard_prompt_without_reference_brief_no_block():
    """UT-06-02 (negative): build_full_storyboard_prompt omits block when no brief."""
    outline = [{"sequenceNumber": 1, "title": "Intro", "keyPoint": "Hook"}]
    prompt = build_full_storyboard_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        outline=outline,
        scene_count=6,
        target_duration_seconds=30,
        reference_brief=None,
    )

    assert "<reference_analysis>" not in prompt


def test_reference_brief_with_empty_topics_no_key_error():
    """UT-06-01 (edge): Empty keyTopics list handled without error."""
    brief_no_topics = {**SAMPLE_REFERENCE_BRIEF, "keyTopics": []}
    prompt = build_outline_prompt(
        niche_profile=DEFAULT_NICHE_PROFILE,
        topic="finance tips",
        reference_brief=brief_no_topics,
    )
    assert "<reference_analysis>" in prompt
    assert "not detected" in prompt

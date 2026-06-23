"""Unit tests for Director Agent prompt builder — UT-03-01, UT-03-02."""
from app.agents.director.prompts import build_worker_prompt, build_outline_prompt
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

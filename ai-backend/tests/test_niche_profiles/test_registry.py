"""Unit tests for ProfileRegistry — UT-06-01 through UT-06-08."""
import textwrap

import pytest
from pydantic import ValidationError

from app.models.director import NicheProfile, ProfileViralityWeights
from app.niche_profiles.registry import ProfileNotFoundError, ProfileRegistry


@pytest.fixture
def registry() -> ProfileRegistry:
    """Fresh registry loaded from built-in presets."""
    return ProfileRegistry()


# ─── UT-06-01: get("tech") returns valid NicheProfile ────────────────────────

def test_get_tech_returns_niche_profile(registry):
    """UT-06-01: ProfileRegistry.get('tech') returns a valid NicheProfile."""
    profile = registry.get("tech")

    assert isinstance(profile, NicheProfile)
    assert profile.name == "tech"
    assert profile.hookPattern != ""
    assert profile.targetSceneCount > 0
    assert isinstance(profile.viralityWeights, ProfileViralityWeights)


# ─── UT-06-02: All 5 built-in presets load without error ─────────────────────

def test_all_builtin_presets_load(registry):
    """UT-06-02: tech, finance, health, entertainment, education + default load cleanly."""
    for name in ["default", "tech", "finance", "health", "entertainment", "education"]:
        profile = registry.get(name)
        assert profile.name == name


def test_all_presets_have_valid_virality_weights(registry):
    """UT-06-02 (weights): all built-in preset virality weights sum to 1.0."""
    for name in registry.available:
        w = registry.get(name).viralityWeights
        total = w.recency_weight + w.controversy_weight + w.momentum_weight
        assert 0.99 <= total <= 1.01, f"{name} weights sum to {total}"


# ─── UT-06-03: Unknown profile name raises ProfileNotFoundError ───────────────

def test_get_nonexistent_raises(registry):
    """UT-06-03: get('cooking') raises ProfileNotFoundError with available names."""
    with pytest.raises(ProfileNotFoundError) as exc_info:
        registry.get("cooking")

    msg = str(exc_info.value)
    assert "cooking" in msg
    assert "tech" in msg  # available list included


# ─── UT-06-04: Weights summing to 1.5 → ValidationError on load ──────────────

def test_invalid_virality_weights_raises(tmp_path):
    """UT-06-04: Profile with recency+controversy+momentum = 1.5 → ValidationError."""
    bad_yaml = textwrap.dedent("""\
        name: bad_weights
        toneProfile: informative
        hookPattern: "Test hook"
        visualVocabulary: []
        captionStyle: standard
        musicMood: neutral
        targetSceneCount: 7
        targetDurationSeconds: 40
        viralityWeights:
          recency_weight: 0.70
          controversy_weight: 0.50
          momentum_weight: 0.30
          duplicate_penalty: 0.25
        ctaKeywords: [subscribe]
    """)
    yaml_file = tmp_path / "bad_weights.yaml"
    yaml_file.write_text(bad_yaml)

    registry = ProfileRegistry()

    with pytest.raises(ValidationError) as exc_info:
        registry.load_custom(yaml_file)

    assert "sum to 1.0" in str(exc_info.value)


# ─── UT-06-05: targetSceneCount = 0 → ValidationError (ge=3) ─────────────────

def test_target_scene_count_zero_raises(tmp_path):
    """UT-06-05: targetSceneCount=0 is below ge=3 → ValidationError."""
    bad_yaml = textwrap.dedent("""\
        name: bad_scenes
        toneProfile: informative
        hookPattern: "Test hook"
        visualVocabulary: []
        captionStyle: standard
        musicMood: neutral
        targetSceneCount: 0
        targetDurationSeconds: 40
        viralityWeights:
          recency_weight: 0.33
          controversy_weight: 0.34
          momentum_weight: 0.33
          duplicate_penalty: 0.25
        ctaKeywords: [subscribe]
    """)
    yaml_file = tmp_path / "bad_scenes.yaml"
    yaml_file.write_text(bad_yaml)

    registry = ProfileRegistry()

    with pytest.raises(ValidationError) as exc_info:
        registry.load_custom(yaml_file)

    assert "targetSceneCount" in str(exc_info.value)


# ─── UT-06-06: Custom profile with extends: "finance" merges correctly ────────

def test_custom_profile_extends_finance(tmp_path, registry):
    """UT-06-06: User YAML with extends: finance overrides musicMood only."""
    custom_yaml = textwrap.dedent("""\
        name: my_finance
        extends: finance
        musicMood: lo-fi hip hop
    """)
    yaml_file = tmp_path / "my_finance.yaml"
    yaml_file.write_text(custom_yaml)

    profile = registry.load_custom(yaml_file)

    # Override applied
    assert profile.musicMood == "lo-fi hip hop"
    # Parent defaults inherited
    finance = registry.get("finance")
    assert profile.toneProfile == finance.toneProfile
    assert profile.hookPattern == finance.hookPattern
    assert profile.targetSceneCount == finance.targetSceneCount
    assert profile.viralityWeights == finance.viralityWeights


def test_custom_profile_registered_after_load(tmp_path, registry):
    """load_custom() registers the profile so get() can find it."""
    custom_yaml = textwrap.dedent("""\
        name: custom_test
        extends: tech
        musicMood: jazz
    """)
    yaml_file = tmp_path / "custom_test.yaml"
    yaml_file.write_text(custom_yaml)

    registry.load_custom(yaml_file)
    profile = registry.get("custom_test")

    assert profile.name == "custom_test"
    assert profile.musicMood == "jazz"


# ─── UT-06-07: No profile for channel → falls back to default ─────────────────

def test_get_for_channel_falls_back_to_default(registry):
    """UT-06-07: Unknown channelId → get_for_channel returns 'default' profile."""
    profile = registry.get_for_channel("unknown-channel-xyz")

    assert profile.name == "default"


def test_get_for_channel_with_mapping(registry):
    """get_for_channel uses channel_profile_map when provided."""
    mapping = {"chan-tech": "tech", "chan-finance": "finance"}

    assert registry.get_for_channel("chan-tech", mapping).name == "tech"
    assert registry.get_for_channel("chan-finance", mapping).name == "finance"
    assert registry.get_for_channel("chan-unknown", mapping).name == "default"


# ─── UT-06-08: NicheProfile serializes to dict with no None values ────────────

def test_niche_profile_no_none_values_in_dict(registry):
    """UT-06-08: model_dump() on any built-in profile has no None values at top level."""
    for name in registry.available:
        profile = registry.get(name)
        data = profile.model_dump()
        none_fields = [k for k, v in data.items() if v is None and k != "extends"]
        assert none_fields == [], f"Profile '{name}' has None fields: {none_fields}"


def test_niche_profile_all_required_fields_present(registry):
    """UT-06-08 (fields): every built-in profile has hookPattern, viralityWeights, ctaKeywords."""
    for name in registry.available:
        profile = registry.get(name)
        assert profile.hookPattern, f"{name}.hookPattern is empty"
        assert profile.ctaKeywords, f"{name}.ctaKeywords is empty"
        assert profile.viralityWeights is not None, f"{name}.viralityWeights is None"


# ─── ProfileViralityWeights model validator ───────────────────────────────────

def test_virality_weights_valid_sum():
    """Weights summing to exactly 1.0 are accepted."""
    w = ProfileViralityWeights(
        recency_weight=0.33,
        controversy_weight=0.34,
        momentum_weight=0.33,
        duplicate_penalty=0.25,
    )
    assert w.recency_weight + w.controversy_weight + w.momentum_weight == pytest.approx(1.0, abs=0.01)


def test_virality_weights_invalid_sum_raises():
    """Weights summing to 1.5 raise ValidationError at construction."""
    with pytest.raises(ValidationError) as exc_info:
        ProfileViralityWeights(
            recency_weight=0.70,
            controversy_weight=0.50,
            momentum_weight=0.30,
            duplicate_penalty=0.25,
        )
    assert "sum to 1.0" in str(exc_info.value)

"""Unit tests for FEATURE-06 Pydantic models — ReferenceAnalysisBrief, AudioAnalysis."""
import pytest
from pydantic import ValidationError

from app.models.reference_analysis import AudioAnalysis, ReferenceAnalysisBrief


def minimal_brief(**overrides) -> dict:
    base = {
        "sourceUrl": "https://youtube.com/watch?v=abc",
        "totalDurationSeconds": 120.0,
        "sceneCount": 10,
        "avgSceneDurationSeconds": 12.0,
        "pacing": "medium",
        "toneProfile": "educational",
        "structurePattern": "hook → content → cta",
    }
    return {**base, **overrides}


class TestAudioAnalysis:
    def test_default_values(self):
        audio = AudioAnalysis()
        assert audio.hasMusic is False
        assert audio.hasSpeech is True
        assert audio.avgLoudnessLUFS == -23.0

    def test_custom_values(self):
        audio = AudioAnalysis(hasMusic=True, hasSpeech=False, avgLoudnessLUFS=-18.5)
        assert audio.hasMusic is True
        assert audio.hasSpeech is False
        assert audio.avgLoudnessLUFS == pytest.approx(-18.5)


class TestReferenceAnalysisBrief:
    def test_valid_minimal_brief(self):
        brief = ReferenceAnalysisBrief.model_validate(minimal_brief())
        assert brief.sourceUrl == "https://youtube.com/watch?v=abc"
        assert brief.sceneCount == 10
        assert brief.pacing == "medium"
        assert brief.toneProfile == "educational"

    def test_optional_fields_have_defaults(self):
        brief = ReferenceAnalysisBrief.model_validate(minimal_brief())
        assert brief.transcript == ""
        assert brief.keyTopics == []
        assert brief.visualStyle == ""
        assert brief.analyzedAt is None
        assert isinstance(brief.audioAnalysis, AudioAnalysis)

    def test_invalid_pacing_raises(self):
        with pytest.raises(ValidationError):
            ReferenceAnalysisBrief.model_validate(minimal_brief(pacing="lightning"))

    def test_invalid_tone_profile_raises(self):
        with pytest.raises(ValidationError):
            ReferenceAnalysisBrief.model_validate(minimal_brief(toneProfile="neutral"))

    def test_valid_pacing_values(self):
        for pacing in ("slow", "medium", "fast", "dynamic"):
            brief = ReferenceAnalysisBrief.model_validate(minimal_brief(pacing=pacing))
            assert brief.pacing == pacing

    def test_valid_tone_profile_values(self):
        for tone in ("serious", "comedic", "inspirational", "educational", "dramatic"):
            brief = ReferenceAnalysisBrief.model_validate(minimal_brief(toneProfile=tone))
            assert brief.toneProfile == tone

    def test_audio_analysis_nested(self):
        data = minimal_brief()
        data["audioAnalysis"] = {"hasMusic": True, "hasSpeech": True, "avgLoudnessLUFS": -16.0}
        brief = ReferenceAnalysisBrief.model_validate(data)
        assert brief.audioAnalysis.hasMusic is True
        assert brief.audioAnalysis.avgLoudnessLUFS == pytest.approx(-16.0)

    def test_json_roundtrip(self):
        """Serialise → deserialise → same values."""
        original = ReferenceAnalysisBrief.model_validate(minimal_brief(
            keyTopics=["AI", "productivity"],
            visualStyle="talking head",
            transcript="Short transcript",
        ))
        json_str = original.model_dump_json()
        restored = ReferenceAnalysisBrief.model_validate_json(json_str)

        assert restored.keyTopics == ["AI", "productivity"]
        assert restored.visualStyle == "talking head"
        assert restored.transcript == "Short transcript"

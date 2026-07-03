"""Unit tests for FEATURE-07 Pydantic models — QualityReport, QualityIssue."""
import pytest
from pydantic import ValidationError

from app.models.quality_report import QualityIssue, QualityReport


def minimal_report(**overrides) -> dict:
    base = {
        "passed": True,
        "overallScore": 0.85,
        "slideshowRiskScore": 0.1,
        "durationSeconds": 42.0,
        "resolutionWidth": 1920,
        "resolutionHeight": 1080,
        "videoBitrateKbps": 2500.0,
        "audioBitrateKbps": 128.0,
        "audioLoudnessLUFS": -18.0,
        "audioTruePeakDBFS": -3.0,
        "blackFrameCount": 0,
        "frozenFrameCount": 0,
        "analyzedAt": "2026-07-02T10:00:00Z",
    }
    return {**base, **overrides}


class TestQualityIssue:
    def test_valid_issue(self):
        issue = QualityIssue(type="black_frames", severity="error", detail="5 black segments")
        assert issue.type == "black_frames"
        assert issue.severity == "error"

    def test_invalid_type_raises(self):
        with pytest.raises(ValidationError):
            QualityIssue(type="pink_frames", severity="warning", detail="test")

    def test_invalid_severity_raises(self):
        with pytest.raises(ValidationError):
            QualityIssue(type="black_frames", severity="info", detail="test")

    def test_all_valid_types(self):
        for t in ("black_frames", "frozen_frames", "audio_clipping", "low_bitrate", "slideshow_risk"):
            issue = QualityIssue(type=t, severity="warning", detail="test")
            assert issue.type == t


class TestQualityReport:
    def test_valid_minimal_report(self):
        report = QualityReport.model_validate(minimal_report())
        assert report.passed is True
        assert report.overallScore == pytest.approx(0.85)

    def test_score_above_1_raises(self):
        with pytest.raises(ValidationError):
            QualityReport.model_validate(minimal_report(overallScore=1.1))

    def test_score_below_0_raises(self):
        with pytest.raises(ValidationError):
            QualityReport.model_validate(minimal_report(overallScore=-0.1))

    def test_slideshow_risk_clamped(self):
        with pytest.raises(ValidationError):
            QualityReport.model_validate(minimal_report(slideshowRiskScore=1.5))

    def test_issues_default_empty(self):
        report = QualityReport.model_validate(minimal_report())
        assert report.issues == []

    def test_issues_nested(self):
        data = minimal_report()
        data["issues"] = [
            {"type": "slideshow_risk", "severity": "warning", "detail": "Only 2 cuts/min"},
            {"type": "black_frames", "severity": "error", "detail": "12 black segments"},
        ]
        report = QualityReport.model_validate(data)
        assert len(report.issues) == 2
        assert report.issues[0].type == "slideshow_risk"

    def test_json_roundtrip(self):
        original = QualityReport.model_validate(minimal_report(passed=False, overallScore=0.3))
        restored = QualityReport.model_validate_json(original.model_dump_json())
        assert restored.passed is False
        assert restored.overallScore == pytest.approx(0.3)

"""Unit tests for post_render_analyzer.py — FEATURE-07.

All FFprobe/FFmpeg calls and HTTP downloads are mocked.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.quality_report import QualityReport
from app.services.ffprobe_service import VideoStructure
from app.services.post_render_analyzer import (
    _compute_slideshow_risk,
    _build_issues_and_score,
    analyze_rendered_video,
)


# ─── _compute_slideshow_risk ──────────────────────────────────────────────────

class TestComputeSlideshowRisk:
    def test_zero_cuts_is_max_risk(self):
        # 0 cuts in 60s = 0 cuts/min → risk = 1.0
        assert _compute_slideshow_risk(0, 60.0) == pytest.approx(1.0)

    def test_many_cuts_is_no_risk(self):
        # 20 cuts in 60s = 20 cuts/min ≥ 12 → risk = 0.0
        assert _compute_slideshow_risk(20, 60.0) == pytest.approx(0.0)

    def test_mid_range_is_interpolated(self):
        # 6.5 cuts/min → exactly halfway between 1 and 12 → risk ≈ 0.5
        risk = _compute_slideshow_risk(round(6.5), 60.0)
        assert 0.3 < risk < 0.7

    def test_zero_duration_returns_zero(self):
        assert _compute_slideshow_risk(5, 0.0) == pytest.approx(0.0)

    def test_exactly_at_risky_threshold(self):
        # 1 cut/min exactly → risk = 1.0
        assert _compute_slideshow_risk(1, 60.0) == pytest.approx(1.0)

    def test_exactly_at_safe_threshold(self):
        # 12 cuts/min exactly → risk = 0.0
        assert _compute_slideshow_risk(12, 60.0) == pytest.approx(0.0)


# ─── _build_issues_and_score ─────────────────────────────────────────────────

class TestBuildIssuesAndScore:
    def _call(self, *, slideshow=0.0, black=0, frozen=0, lufs=-18.0, peak=-3.0, kbps=2000.0):
        return _build_issues_and_score(slideshow, black, frozen, lufs, peak, kbps)

    def test_clean_video_no_issues_full_score(self):
        issues, score = self._call()
        assert issues == []
        assert score == pytest.approx(1.0)

    def test_high_slideshow_risk_error_deducts(self):
        issues, score = self._call(slideshow=0.85)
        types = [i.type for i in issues]
        assert "slideshow_risk" in types
        severities = [i.severity for i in issues]
        assert "error" in severities
        assert score < 0.75

    def test_slideshow_warning_level(self):
        issues, score = self._call(slideshow=0.65)
        types = [i.type for i in issues]
        assert "slideshow_risk" in types
        assert any(i.severity == "warning" for i in issues)

    def test_many_black_frames_is_error(self):
        issues, score = self._call(black=15)
        assert any(i.type == "black_frames" and i.severity == "error" for i in issues)
        assert score < 0.9

    def test_few_black_frames_is_warning(self):
        issues, score = self._call(black=2)
        assert any(i.type == "black_frames" and i.severity == "warning" for i in issues)

    def test_audio_clipping_detected(self):
        # True peak above -1 dBFS is clipping
        issues, score = self._call(peak=0.5)
        assert any(i.type == "audio_clipping" and i.severity == "error" for i in issues)

    def test_low_lufs_warning(self):
        # loudness below -30 LUFS
        issues, _ = self._call(lufs=-35.0, peak=-10.0)
        assert any(i.type == "audio_clipping" and i.severity == "warning" for i in issues)

    def test_low_video_bitrate_warning(self):
        issues, _ = self._call(kbps=200.0)
        assert any(i.type == "low_bitrate" for i in issues)

    def test_score_never_below_zero(self):
        # Worst case: everything wrong
        issues, score = self._call(slideshow=0.9, black=15, frozen=10, lufs=-35.0, peak=0.5, kbps=100.0)
        assert score >= 0.0

    def test_passed_threshold_at_05(self):
        # score ≥ 0.5 → passed, score < 0.5 → failed
        _, high_score = self._call()
        assert high_score >= 0.5

        _, low_score = self._call(slideshow=0.9, black=15, frozen=10, lufs=0.0, peak=0.5, kbps=100.0)
        assert low_score < 0.5


# ─── analyze_rendered_video (full pipeline) ───────────────────────────────────

FAKE_STRUCTURE = VideoStructure(
    duration_seconds=42.0,
    width=1920,
    height=1080,
    fps=30.0,
    has_audio=True,
)


class TestAnalyzeRenderedVideo:
    @pytest.mark.asyncio
    async def test_happy_path_returns_quality_report(self):
        with patch("app.services.post_render_analyzer._download_video", AsyncMock(return_value="/tmp/fake.mp4")), \
             patch("app.services.post_render_analyzer.ffprobe.probe_video", AsyncMock(return_value=FAKE_STRUCTURE)), \
             patch("app.services.post_render_analyzer.ffprobe.probe_bitrates", AsyncMock(return_value=(2500.0, 128.0))), \
             patch("app.services.post_render_analyzer.ffprobe.detect_black_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.detect_frozen_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.count_scene_changes", AsyncMock(return_value=15)), \
             patch("app.services.post_render_analyzer.ffprobe.measure_audio_loudness", AsyncMock(return_value=-18.0)), \
             patch("app.services.post_render_analyzer._measure_true_peak", AsyncMock(return_value=-3.0)), \
             patch("app.services.post_render_analyzer._safe_delete"):
            report = await analyze_rendered_video("https://s3.example.com/renders/test.mp4")

        assert isinstance(report, QualityReport)
        assert report.passed is True
        assert report.overallScore == pytest.approx(1.0)
        assert report.durationSeconds == 42.0
        assert report.resolutionWidth == 1920
        assert report.resolutionHeight == 1080
        assert report.videoBitrateKbps == pytest.approx(2500.0)
        assert report.audioBitrateKbps == pytest.approx(128.0)

    @pytest.mark.asyncio
    async def test_slideshow_detected_in_report(self):
        """Low scene count → slideshow risk > 0 → issue in report."""
        with patch("app.services.post_render_analyzer._download_video", AsyncMock(return_value="/tmp/fake.mp4")), \
             patch("app.services.post_render_analyzer.ffprobe.probe_video", AsyncMock(return_value=FAKE_STRUCTURE)), \
             patch("app.services.post_render_analyzer.ffprobe.probe_bitrates", AsyncMock(return_value=(2000.0, 128.0))), \
             patch("app.services.post_render_analyzer.ffprobe.detect_black_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.detect_frozen_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.count_scene_changes", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.measure_audio_loudness", AsyncMock(return_value=-18.0)), \
             patch("app.services.post_render_analyzer._measure_true_peak", AsyncMock(return_value=-5.0)), \
             patch("app.services.post_render_analyzer._safe_delete"):
            report = await analyze_rendered_video("https://s3.example.com/renders/slideshow.mp4")

        assert report.slideshowRiskScore == pytest.approx(1.0)
        assert any(i.type == "slideshow_risk" for i in report.issues)

    @pytest.mark.asyncio
    async def test_cleanup_called_on_success(self):
        delete_calls: list[str] = []

        def record_delete(path: str):
            if path:
                delete_calls.append(path)

        with patch("app.services.post_render_analyzer._download_video", AsyncMock(return_value="/tmp/fake.mp4")), \
             patch("app.services.post_render_analyzer.ffprobe.probe_video", AsyncMock(return_value=FAKE_STRUCTURE)), \
             patch("app.services.post_render_analyzer.ffprobe.probe_bitrates", AsyncMock(return_value=(2000.0, 128.0))), \
             patch("app.services.post_render_analyzer.ffprobe.detect_black_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.detect_frozen_frames", AsyncMock(return_value=0)), \
             patch("app.services.post_render_analyzer.ffprobe.count_scene_changes", AsyncMock(return_value=10)), \
             patch("app.services.post_render_analyzer.ffprobe.measure_audio_loudness", AsyncMock(return_value=-18.0)), \
             patch("app.services.post_render_analyzer._measure_true_peak", AsyncMock(return_value=-5.0)), \
             patch("app.services.post_render_analyzer._safe_delete", side_effect=record_delete):
            await analyze_rendered_video("https://s3.example.com/renders/test.mp4")

        assert "/tmp/fake.mp4" in delete_calls

    @pytest.mark.asyncio
    async def test_download_failure_propagates(self):
        with patch("app.services.post_render_analyzer._download_video",
                   AsyncMock(side_effect=RuntimeError("HTTP 403 Forbidden"))):
            with pytest.raises(RuntimeError, match="HTTP 403"):
                await analyze_rendered_video("https://s3.example.com/expired-presigned.mp4")

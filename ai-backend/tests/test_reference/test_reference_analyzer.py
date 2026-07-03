"""Unit tests for reference_analyzer.py — FEATURE-06.

Tests use mocked ffprobe/ffmpeg calls and mocked OpenAI so no network or
subprocess is involved. Verifies the full pipeline assembles correctly and
degrades gracefully on partial failures.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.reference_analysis import AudioAnalysis, ReferenceAnalysisBrief
from app.services.ffprobe_service import VideoStructure
from app.services.reference_analyzer import _synthesize_brief

# ─── _synthesize_brief ────────────────────────────────────────────────────────

FAKE_STRUCTURE = VideoStructure(
    duration_seconds=60.0,
    width=1920,
    height=1080,
    fps=30.0,
    has_audio=True,
)

FAKE_SCENE_TIMESTAMPS = [0.0, 5.0, 10.0, 15.0, 20.0, 25.0, 30.0]

FAKE_GPT_RESPONSE = {
    "toneProfile": "educational",
    "structurePattern": "hook → problem → solution → cta",
    "keyTopics": ["AI", "machine learning", "automation"],
    "visualStyle": "talking head with b-roll cutaways",
    "hasMusic": True,
    "hasSpeech": True,
}


class TestSynthesizeBrief:
    @pytest.mark.asyncio
    async def test_returns_reference_analysis_brief(self):
        """_synthesize_brief assembles a valid ReferenceAnalysisBrief from components."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            '{"toneProfile":"educational","structurePattern":"hook → solution",'
            '"keyTopics":["AI"],"visualStyle":"talking head","hasMusic":false,"hasSpeech":true}'
        )
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            brief = await _synthesize_brief(
                source_url="https://youtube.com/watch?v=test",
                structure=FAKE_STRUCTURE,
                scene_timestamps=FAKE_SCENE_TIMESTAMPS,
                transcript="This is a test transcript.",
                frames_b64=[],
                avg_loudness=-20.0,
            )

        assert isinstance(brief, ReferenceAnalysisBrief)
        assert brief.sourceUrl == "https://youtube.com/watch?v=test"
        assert brief.totalDurationSeconds == 60.0
        assert brief.sceneCount == len(FAKE_SCENE_TIMESTAMPS)
        assert brief.toneProfile == "educational"
        assert brief.structurePattern == "hook → solution"
        assert "AI" in brief.keyTopics
        assert brief.visualStyle == "talking head"
        assert brief.audioAnalysis.hasSpeech is True
        assert brief.audioAnalysis.avgLoudnessLUFS == -20.0

    @pytest.mark.asyncio
    async def test_pacing_computed_from_timestamps(self):
        """Pacing is derived from scene timestamps, not from GPT response."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            '{"toneProfile":"serious","structurePattern":"intro → body","keyTopics":[],'
            '"visualStyle":"","hasMusic":false,"hasSpeech":false}'
        )
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        # avg scene duration = 2s → fast
        # Use total_duration = 10.0 so the last scene (8→10) is also 2s
        fast_timestamps = [0.0, 2.0, 4.0, 6.0, 8.0]
        fast_structure = VideoStructure(
            duration_seconds=10.0,  # last scene: 8→10 = 2s avg
            width=1920,
            height=1080,
            fps=30.0,
            has_audio=True,
        )

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            brief = await _synthesize_brief(
                source_url="https://example.com/video.mp4",
                structure=fast_structure,
                scene_timestamps=fast_timestamps,
                transcript="",
                frames_b64=[],
                avg_loudness=-23.0,
            )

        assert brief.pacing == "fast"

    @pytest.mark.asyncio
    async def test_gpt_failure_returns_defaults(self):
        """When GPT call fails, returns brief with safe default values."""
        mock_client = MagicMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=Exception("OpenAI unavailable")
        )

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            brief = await _synthesize_brief(
                source_url="https://example.com/video.mp4",
                structure=FAKE_STRUCTURE,
                scene_timestamps=FAKE_SCENE_TIMESTAMPS,
                transcript="",
                frames_b64=[],
                avg_loudness=-23.0,
            )

        assert isinstance(brief, ReferenceAnalysisBrief)
        assert brief.toneProfile == "educational"  # default
        assert brief.structurePattern == "intro → content → outro"  # default
        assert brief.keyTopics == []

    @pytest.mark.asyncio
    async def test_uses_vision_model_when_frames_present(self):
        """When frames are present, gpt-4o (vision) is used instead of gpt-4o-mini."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            '{"toneProfile":"inspirational","structurePattern":"hook → content","keyTopics":[],'
            '"visualStyle":"cinematic","hasMusic":true,"hasSpeech":true}'
        )
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            await _synthesize_brief(
                source_url="https://example.com/video.mp4",
                structure=FAKE_STRUCTURE,
                scene_timestamps=FAKE_SCENE_TIMESTAMPS,
                transcript="",
                frames_b64=["base64encodedframe1", "base64encodedframe2"],
                avg_loudness=-23.0,
            )

        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs.kwargs["model"] == "gpt-4o"

    @pytest.mark.asyncio
    async def test_uses_mini_model_without_frames(self):
        """Without frames, gpt-4o-mini is used to reduce cost."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            '{"toneProfile":"dramatic","structurePattern":"hook → climax","keyTopics":[],'
            '"visualStyle":"","hasMusic":false,"hasSpeech":true}'
        )
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            await _synthesize_brief(
                source_url="https://example.com/video.mp4",
                structure=FAKE_STRUCTURE,
                scene_timestamps=FAKE_SCENE_TIMESTAMPS,
                transcript="",
                frames_b64=[],  # no frames
                avg_loudness=-23.0,
            )

        call_kwargs = mock_client.chat.completions.create.call_args
        assert call_kwargs.kwargs["model"] == "gpt-4o-mini"

    @pytest.mark.asyncio
    async def test_transcript_capped_at_5000_chars(self):
        """Stored transcript is capped at 5000 characters."""
        long_transcript = "word " * 2000  # 10000 chars

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            '{"toneProfile":"educational","structurePattern":"","keyTopics":[],'
            '"visualStyle":"","hasMusic":false,"hasSpeech":true}'
        )
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("app.services.reference_analyzer.AsyncOpenAI", return_value=mock_client):
            brief = await _synthesize_brief(
                source_url="https://example.com/v.mp4",
                structure=FAKE_STRUCTURE,
                scene_timestamps=FAKE_SCENE_TIMESTAMPS,
                transcript=long_transcript,
                frames_b64=[],
                avg_loudness=-23.0,
            )

        assert len(brief.transcript) <= 5000


# ─── analyze_reference_video (full pipeline) ──────────────────────────────────

class TestAnalyzeReferenceVideo:
    @pytest.mark.asyncio
    async def test_full_pipeline_happy_path(self):
        """analyze_reference_video returns brief when all steps succeed."""
        from app.services.reference_analyzer import analyze_reference_video

        fake_brief = ReferenceAnalysisBrief(
            sourceUrl="https://youtube.com/watch?v=abc",
            totalDurationSeconds=120.0,
            sceneCount=10,
            avgSceneDurationSeconds=12.0,
            pacing="medium",
            toneProfile="educational",
            structurePattern="hook → content → cta",
            transcript="Test transcript",
            keyTopics=["AI", "video"],
            visualStyle="talking head",
            audioAnalysis=AudioAnalysis(hasMusic=False, hasSpeech=True, avgLoudnessLUFS=-20.0),
        )

        with patch("app.services.reference_analyzer.download_reference_video", AsyncMock(return_value="/tmp/fake.mp4")), \
             patch("app.services.reference_analyzer.ffprobe.probe_video", AsyncMock(return_value=FAKE_STRUCTURE)), \
             patch("app.services.reference_analyzer.ffprobe.detect_scenes", AsyncMock(return_value=[0.0, 5.0, 10.0])), \
             patch("app.services.reference_analyzer.ffprobe.sample_frames", AsyncMock(return_value=[])), \
             patch("app.services.reference_analyzer.ffprobe.extract_audio", AsyncMock(return_value="/tmp/fake_audio.mp3")), \
             patch("app.services.reference_analyzer.ffprobe.measure_audio_loudness", AsyncMock(return_value=-20.0)), \
             patch("app.services.reference_analyzer._transcribe_audio", AsyncMock(return_value="Test transcript")), \
             patch("app.services.reference_analyzer._synthesize_brief", AsyncMock(return_value=fake_brief)), \
             patch("app.services.reference_analyzer._safe_delete"):
            result = await analyze_reference_video("https://youtube.com/watch?v=abc")

        assert isinstance(result, ReferenceAnalysisBrief)
        assert result.sourceUrl == "https://youtube.com/watch?v=abc"
        assert result.sceneCount == 10

    @pytest.mark.asyncio
    async def test_cleanup_called_on_success(self):
        """Temp files are deleted even when pipeline succeeds."""
        from app.services.reference_analyzer import analyze_reference_video

        fake_brief = ReferenceAnalysisBrief(
            sourceUrl="https://example.com/v.mp4",
            totalDurationSeconds=30.0,
            sceneCount=3,
            avgSceneDurationSeconds=10.0,
            pacing="slow",
            toneProfile="serious",
            structurePattern="intro → outro",
            audioAnalysis=AudioAnalysis(),
        )

        delete_calls: list[str] = []

        def record_delete(path: str):
            if path:
                delete_calls.append(path)

        with patch("app.services.reference_analyzer.download_reference_video", AsyncMock(return_value="/tmp/video.mp4")), \
             patch("app.services.reference_analyzer.ffprobe.probe_video", AsyncMock(return_value=FAKE_STRUCTURE)), \
             patch("app.services.reference_analyzer.ffprobe.detect_scenes", AsyncMock(return_value=[0.0])), \
             patch("app.services.reference_analyzer.ffprobe.sample_frames", AsyncMock(return_value=[])), \
             patch("app.services.reference_analyzer.ffprobe.extract_audio", AsyncMock(return_value="/tmp/audio.mp3")), \
             patch("app.services.reference_analyzer.ffprobe.measure_audio_loudness", AsyncMock(return_value=-23.0)), \
             patch("app.services.reference_analyzer._transcribe_audio", AsyncMock(return_value="")), \
             patch("app.services.reference_analyzer._synthesize_brief", AsyncMock(return_value=fake_brief)), \
             patch("app.services.reference_analyzer._safe_delete", side_effect=record_delete):
            await analyze_reference_video("https://example.com/v.mp4")

        assert "/tmp/video.mp4" in delete_calls
        assert "/tmp/audio.mp3" in delete_calls

    @pytest.mark.asyncio
    async def test_exception_propagates_on_download_failure(self):
        """RuntimeError from download propagates to caller (no swallowing)."""
        from app.services.reference_analyzer import analyze_reference_video

        with patch("app.services.reference_analyzer.download_reference_video",
                   AsyncMock(side_effect=RuntimeError("yt-dlp failed"))), \
             patch("app.services.reference_analyzer._safe_delete", MagicMock()):
            with pytest.raises(RuntimeError, match="yt-dlp failed"):
                await analyze_reference_video("https://youtube.com/watch?v=fail")

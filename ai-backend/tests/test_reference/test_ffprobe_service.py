"""Unit tests for ffprobe_service — FEATURE-06 Reference Video Analysis.

Tests cover:
  - _classify_pacing (derived from reference_analyzer.py where it lives)
  - VideoStructure dataclass defaults
  - _run error handling (fatal vs. acceptable exit codes)
  - detect_scenes timestamp parsing
  - measure_audio_loudness LUFS parsing
"""
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ffprobe_service import VideoStructure, _run, detect_scenes, measure_audio_loudness
from app.services.reference_analyzer import _classify_pacing


# ─── _classify_pacing ─────────────────────────────────────────────────────────

class TestClassifyPacing:
    def test_fast_pacing_short_avg_scene(self):
        # avg = 2s → fast
        timestamps = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0]
        result = _classify_pacing(timestamps, total_duration=10.0)
        assert result == "fast"

    def test_slow_pacing_long_avg_scene(self):
        # avg = 10s → slow
        timestamps = [0.0, 10.0, 20.0, 30.0]
        result = _classify_pacing(timestamps, total_duration=30.0)
        assert result == "slow"

    def test_medium_pacing(self):
        # avg = 5s → medium
        timestamps = [0.0, 5.0, 10.0, 15.0]
        result = _classify_pacing(timestamps, total_duration=15.0)
        assert result == "medium"

    def test_dynamic_pacing_high_variance(self):
        # Mix of very short and very long scenes → high std/avg ratio → dynamic
        timestamps = [0.0, 0.5, 1.0, 15.0, 20.0]
        result = _classify_pacing(timestamps, total_duration=20.0)
        assert result == "dynamic"

    def test_empty_timestamps_returns_medium(self):
        result = _classify_pacing([], total_duration=30.0)
        assert result == "medium"

    def test_single_timestamp_returns_medium(self):
        result = _classify_pacing([0.0], total_duration=30.0)
        assert result == "medium"

    def test_zero_duration_returns_medium(self):
        result = _classify_pacing([0.0, 5.0, 10.0], total_duration=0.0)
        assert result == "medium"


# ─── VideoStructure ──────────────────────────────────────────────────────────

class TestVideoStructure:
    def test_default_values(self):
        vs = VideoStructure(
            duration_seconds=30.0,
            width=1920,
            height=1080,
            fps=30.0,
            has_audio=True,
        )
        assert vs.avg_loudness_lufs == -23.0
        assert vs.scene_timestamps == []

    def test_with_scene_timestamps(self):
        vs = VideoStructure(
            duration_seconds=60.0,
            width=1280,
            height=720,
            fps=24.0,
            has_audio=False,
            scene_timestamps=[0.0, 5.0, 10.0],
        )
        assert vs.scene_timestamps == [0.0, 5.0, 10.0]
        assert vs.has_audio is False


# ─── _run error handling ──────────────────────────────────────────────────────

class TestRun:
    @pytest.mark.asyncio
    async def test_run_success(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(b"output", b""))

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"output", b""))):
            stdout, stderr = await _run(["ffprobe", "-version"])

        assert stdout == b"output"

    @pytest.mark.asyncio
    async def test_run_exit_code_1_not_fatal(self):
        """Exit code 1 without a fatal message is acceptable (ffmpeg filter commands)."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.communicate = AsyncMock(return_value=(b"", b"normal stderr output"))

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"normal stderr output"))):
            stdout, stderr = await _run(["ffmpeg", "-f", "null"])

        assert stderr == b"normal stderr output"

    @pytest.mark.asyncio
    async def test_run_fatal_message_raises(self):
        """Exit code 1 with 'no such file' in stderr should raise RuntimeError."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        fatal_stderr = b"no such file or directory: /missing/file.mp4"

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fatal_stderr))):
            with pytest.raises(RuntimeError, match="Command failed"):
                await _run(["ffprobe", "/missing/file.mp4"])

    @pytest.mark.asyncio
    async def test_run_exit_code_2_always_raises(self):
        """Exit code >= 2 always raises RuntimeError."""
        mock_proc = MagicMock()
        mock_proc.returncode = 2

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"some stderr"))):
            with pytest.raises(RuntimeError, match="Command failed"):
                await _run(["ffprobe", "some_file"])


# ─── detect_scenes timestamp parsing ─────────────────────────────────────────

class TestDetectScenes:
    @pytest.mark.asyncio
    async def test_parses_pts_time_from_stderr(self):
        """detect_scenes correctly extracts timestamps from ffmpeg showinfo output."""
        fake_stderr = (
            b"[Parsed_showinfo_1] n:  0 pts:  0 pts_time:0.000 ...\n"
            b"[Parsed_showinfo_1] n:  1 pts:  150 pts_time:5.000 ...\n"
            b"[Parsed_showinfo_1] n:  2 pts:  300 pts_time:10.000 ...\n"
        )

        mock_proc = MagicMock()
        mock_proc.returncode = 1  # ffmpeg filter exits with 1 (acceptable)

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fake_stderr))):
            timestamps = await detect_scenes("/fake/video.mp4")

        assert 0.0 in timestamps
        assert 5.0 in timestamps
        assert 10.0 in timestamps
        assert timestamps == sorted(timestamps)

    @pytest.mark.asyncio
    async def test_always_includes_zero(self):
        """detect_scenes always includes 0.0 as first timestamp."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"no pts_time lines here"))):
            timestamps = await detect_scenes("/fake/video.mp4")

        assert timestamps[0] == 0.0


# ─── measure_audio_loudness LUFS parsing ─────────────────────────────────────

class TestMeasureAudioLoudness:
    @pytest.mark.asyncio
    async def test_parses_integrated_loudness(self):
        fake_stderr = (
            b"[Parsed_ebur128_0 @ 0x...] Summary:\n"
            b"  Integrated loudness:\n"
            b"    I: -18.3 LUFS\n"
            b"    Threshold: -28.3 LUFS\n"
        )
        mock_proc = MagicMock()
        mock_proc.returncode = 1  # acceptable

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fake_stderr))):
            lufs = await measure_audio_loudness("/fake/audio.mp3")

        assert lufs == pytest.approx(-18.3, abs=0.01)

    @pytest.mark.asyncio
    async def test_returns_fallback_on_parse_failure(self):
        """Returns -23.0 (EBU R 128 reference) when stdout can't be parsed."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1

        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"unrecognized output format"))):
            lufs = await measure_audio_loudness("/fake/audio.mp3")

        assert lufs == -23.0

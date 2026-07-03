"""Unit tests for FEATURE-07 ffprobe extensions — probe_bitrates, detect_black_frames,
detect_frozen_frames, count_scene_changes.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ffprobe_service import (
    count_scene_changes,
    detect_black_frames,
    detect_frozen_frames,
    probe_bitrates,
)


class TestProbeBitrates:
    @pytest.mark.asyncio
    async def test_parses_per_stream_bitrates(self):
        fake_json = b"""{
          "streams": [
            {"codec_type": "video", "bit_rate": "2500000"},
            {"codec_type": "audio", "bit_rate": "128000"}
          ],
          "format": {"bit_rate": "2628000"}
        }"""
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(fake_json, b""))):
            video_kbps, audio_kbps = await probe_bitrates("/fake/video.mp4")

        assert video_kbps == pytest.approx(2500.0, abs=1)
        assert audio_kbps == pytest.approx(128.0, abs=1)

    @pytest.mark.asyncio
    async def test_fallback_to_format_bitrate(self):
        """When stream bit_rate missing, falls back to format bit_rate 80/20 split."""
        fake_json = b"""{
          "streams": [
            {"codec_type": "video"},
            {"codec_type": "audio"}
          ],
          "format": {"bit_rate": "1000000"}
        }"""
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(fake_json, b""))):
            video_kbps, audio_kbps = await probe_bitrates("/fake/video.mp4")

        assert video_kbps == pytest.approx(800.0, abs=1)
        assert audio_kbps == pytest.approx(200.0, abs=1)

    @pytest.mark.asyncio
    async def test_returns_zeros_on_parse_failure(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 0
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"not json", b""))):
            video_kbps, audio_kbps = await probe_bitrates("/fake/video.mp4")

        assert video_kbps == 0.0
        assert audio_kbps == 0.0


class TestDetectBlackFrames:
    @pytest.mark.asyncio
    async def test_counts_black_start_lines(self):
        fake_stderr = (
            b"[blackdetect @ 0x...] black_start:0.5 black_end:1.2\n"
            b"[blackdetect @ 0x...] black_start:10.0 black_end:10.5\n"
            b"[blackdetect @ 0x...] some other line\n"
        )
        mock_proc = MagicMock()
        mock_proc.returncode = 1  # ffmpeg filter exit code
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fake_stderr))):
            count = await detect_black_frames("/fake/video.mp4")

        assert count == 2

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_black_frames(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"frame=240 fps=30"))):
            count = await detect_black_frames("/fake/video.mp4")

        assert count == 0


class TestDetectFrozenFrames:
    @pytest.mark.asyncio
    async def test_counts_freeze_start_lines(self):
        fake_stderr = (
            b"[freezedetect @ 0x...] freeze_start: 5.0\n"
            b"[freezedetect @ 0x...] freeze_end: 8.0\n"
            b"[freezedetect @ 0x...] freeze_start: 20.0\n"
            b"[freezedetect @ 0x...] freeze_end: 25.0\n"
        )
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fake_stderr))):
            count = await detect_frozen_frames("/fake/video.mp4")

        assert count == 2

    @pytest.mark.asyncio
    async def test_returns_zero_when_no_freezes(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"no freezes here"))):
            count = await detect_frozen_frames("/fake/video.mp4")

        assert count == 0


class TestCountSceneChanges:
    @pytest.mark.asyncio
    async def test_counts_pts_time_lines(self):
        fake_stderr = (
            b"[Parsed_showinfo] n: 0 pts_time:0.5\n"
            b"[Parsed_showinfo] n: 1 pts_time:3.2\n"
            b"[Parsed_showinfo] n: 2 pts_time:7.8\n"
            b"some unrelated line\n"
        )
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", fake_stderr))):
            count = await count_scene_changes("/fake/video.mp4")

        assert count == 3

    @pytest.mark.asyncio
    async def test_returns_zero_for_no_scene_changes(self):
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        with patch("asyncio.create_subprocess_exec", return_value=mock_proc), \
             patch("asyncio.wait_for", AsyncMock(return_value=(b"", b"frame=1200 fps=30"))):
            count = await count_scene_changes("/fake/video.mp4")

        assert count == 0

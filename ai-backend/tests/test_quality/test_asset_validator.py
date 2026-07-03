"""Unit tests for FEATURE-07 asset_validator — validate_single_asset / validate_assets."""
from unittest.mock import AsyncMock, patch

import pytest

from app.services.asset_validator import validate_assets, validate_single_asset


def _ffprobe_ok(codec_type: str, codec_name: str, duration: float = 5.0, fmt_name: str = "mp4") -> bytes:
    import json
    return json.dumps({
        "streams": [{"codec_type": codec_type, "codec_name": codec_name}],
        "format": {"duration": str(duration), "format_name": fmt_name},
    }).encode()


def _ffprobe_empty() -> bytes:
    import json
    return json.dumps({"streams": [], "format": {"duration": "0", "format_name": ""}}).encode()


def _patch_run(stdout: bytes):
    """Patch _run to return fixed stdout without touching the network."""
    return patch(
        "app.services.asset_validator._run",
        new=AsyncMock(return_value=(stdout, b"")),
    )


class TestValidateSingleAsset:

    @pytest.mark.asyncio
    async def test_valid_h264_video_passes(self):
        with _patch_run(_ffprobe_ok("video", "h264")):
            result = await validate_single_asset("sc-1", "https://s3.example.com/video.mp4", "video")

        assert result["valid"] is True
        assert result["codec"] == "h264"
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_valid_aac_audio_passes(self):
        with _patch_run(_ffprobe_ok("audio", "aac", fmt_name="mp4")):
            result = await validate_single_asset("sc-1", "https://s3.example.com/audio.mp3", "audio")

        assert result["valid"] is True
        assert result["codec"] == "aac"
        assert result["error"] is None

    @pytest.mark.asyncio
    async def test_no_video_stream_fails(self):
        with _patch_run(_ffprobe_empty()):
            result = await validate_single_asset("sc-1", "https://s3.example.com/video.mp4", "video")

        assert result["valid"] is False
        assert "No video stream" in result["error"]

    @pytest.mark.asyncio
    async def test_no_audio_stream_fails(self):
        with _patch_run(_ffprobe_empty()):
            result = await validate_single_asset("sc-1", "https://s3.example.com/audio.mp3", "audio")

        assert result["valid"] is False
        assert "No audio stream" in result["error"]

    @pytest.mark.asyncio
    async def test_unsupported_video_codec_fails(self):
        with _patch_run(_ffprobe_ok("video", "theora")):
            result = await validate_single_asset("sc-1", "https://s3.example.com/video.ogv", "video")

        assert result["valid"] is False
        assert "codec" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_video_shorter_than_narration_fails(self):
        with _patch_run(_ffprobe_ok("video", "h264", duration=2.5)):
            result = await validate_single_asset(
                "sc-1", "https://s3.example.com/video.mp4", "video",
                expected_min_duration=5.0,
            )

        assert result["valid"] is False
        assert "narration" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_video_meets_narration_duration_passes(self):
        with _patch_run(_ffprobe_ok("video", "h264", duration=6.0)):
            result = await validate_single_asset(
                "sc-1", "https://s3.example.com/video.mp4", "video",
                expected_min_duration=5.0,
            )

        assert result["valid"] is True

    @pytest.mark.asyncio
    async def test_ffprobe_exception_returns_invalid_result(self):
        with patch("app.services.asset_validator._run", new=AsyncMock(side_effect=RuntimeError("ffprobe not found"))):
            result = await validate_single_asset("sc-1", "https://s3.example.com/video.mp4", "video")

        assert result["valid"] is False
        assert "FFprobe failed" in result["error"]

    @pytest.mark.asyncio
    async def test_zero_duration_video_fails(self):
        with _patch_run(_ffprobe_ok("video", "h264", duration=0.0)):
            result = await validate_single_asset("sc-1", "https://s3.example.com/video.mp4", "video")

        assert result["valid"] is False
        assert "duration" in result["error"].lower()


class TestValidateAssets:

    @pytest.mark.asyncio
    async def test_all_valid_returns_all_valid_true(self):
        with _patch_run(_ffprobe_ok("video", "h264")):
            report = await validate_assets([
                {"sceneId": "sc-1", "assetUrl": "https://s3.example.com/v.mp4", "assetType": "video"},
            ])

        assert report["allValid"] is True
        assert len(report["results"]) == 1

    @pytest.mark.asyncio
    async def test_one_invalid_returns_all_valid_false(self):
        async def _side_effect(*args, **kwargs):
            # First call: video stream missing
            return (b'{"streams": [], "format": {"duration": "0", "format_name": ""}}', b"")

        with patch("app.services.asset_validator._run", new=AsyncMock(side_effect=_side_effect)):
            report = await validate_assets([
                {"sceneId": "sc-1", "assetUrl": "https://s3.example.com/v.mp4", "assetType": "video"},
            ])

        assert report["allValid"] is False
        assert report["results"][0]["valid"] is False

    @pytest.mark.asyncio
    async def test_multiple_assets_validated_in_parallel(self):
        call_count = 0

        async def _counting_run(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return (_ffprobe_ok("video", "h264"), b"")

        with patch("app.services.asset_validator._run", new=AsyncMock(side_effect=_counting_run)):
            report = await validate_assets([
                {"sceneId": "sc-1", "assetUrl": "https://s3.example.com/v1.mp4", "assetType": "video"},
                {"sceneId": "sc-2", "assetUrl": "https://s3.example.com/v2.mp4", "assetType": "video"},
            ])

        assert call_count == 2
        assert len(report["results"]) == 2

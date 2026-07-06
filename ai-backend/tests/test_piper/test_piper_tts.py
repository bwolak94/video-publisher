"""Unit tests for PiperTTSService and /api/tts/piper endpoint (FEATURE-08)."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.piper_tts import PiperTTSService


# ── UT-08-10: synthesize() raises FileNotFoundError for missing model ─────────

async def test_synthesize_raises_if_model_missing(tmp_path):
    """PiperTTSService.synthesize() raises FileNotFoundError when .onnx absent."""
    svc = PiperTTSService(models_dir=str(tmp_path), binary="piper")
    with pytest.raises(FileNotFoundError, match="en_US-lessac-medium.onnx"):
        await svc.synthesize("Hello", "en_US-lessac-medium")


# ── UT-08-11: synthesize() returns MP3 bytes on success ──────────────────────

async def test_synthesize_returns_mp3_bytes(tmp_path):
    """PiperTTSService.synthesize() runs piper + ffmpeg and returns MP3 bytes."""
    model_path = tmp_path / "en_US-lessac-medium.onnx"
    model_path.write_bytes(b"fake-onnx")

    mp3_data = b"ID3fake-mp3-content"

    svc = PiperTTSService(models_dir=str(tmp_path), binary="piper")

    async def mock_run_piper(text: str, model: str, wav: str) -> None:
        # Create a fake WAV file so ffmpeg "input" exists
        with open(wav, "wb") as f:
            f.write(b"RIFF....WAVEfmt ")

    async def mock_wav_to_mp3(wav: str, mp3: str) -> None:
        with open(mp3, "wb") as f:
            f.write(mp3_data)

    with (
        patch.object(svc, "_run_piper", mock_run_piper),
        patch.object(svc, "_wav_to_mp3", mock_wav_to_mp3),
    ):
        result = await svc.synthesize("Hello world", "en_US-lessac-medium")

    assert result == mp3_data


# ── UT-08-12: _run_piper raises RuntimeError on non-zero exit ─────────────────

async def test_run_piper_raises_on_nonzero_exit(tmp_path):
    """_run_piper raises RuntimeError when piper exits with non-zero code."""
    model_path = tmp_path / "en_US-lessac-medium.onnx"
    model_path.write_bytes(b"fake-onnx")
    wav_path = str(tmp_path / "out.wav")

    svc = PiperTTSService(models_dir=str(tmp_path), binary="piper")

    mock_proc = AsyncMock()
    mock_proc.returncode = 1
    mock_proc.communicate = AsyncMock(return_value=(b"", b"model load failed"))

    with patch("asyncio.create_subprocess_exec", return_value=mock_proc):
        with pytest.raises(RuntimeError, match="Piper exited 1"):
            await svc._run_piper("text", str(model_path), wav_path)


# ── IT-08-01: POST /api/tts/piper → 404 when model file missing ──────────────

def test_piper_endpoint_404_when_model_missing():
    """POST /api/tts/piper returns 404 when model .onnx file does not exist."""
    app = create_app()
    client = TestClient(app, raise_server_exceptions=False)

    with patch(
        "app.api.tts._piper.synthesize",
        side_effect=FileNotFoundError("model not found"),
    ):
        resp = client.post(
            "/api/tts/piper",
            json={"text": "Hello", "model_name": "nonexistent-model"},
        )

    assert resp.status_code == 404
    assert "model not found" in resp.json()["detail"]


# ── IT-08-02: POST /api/tts/piper → 200 audio/mpeg on success ────────────────

def test_piper_endpoint_returns_mp3_bytes():
    """POST /api/tts/piper returns 200 with audio/mpeg content type."""
    fake_mp3 = b"ID3fake-mp3-bytes"
    app = create_app()
    client = TestClient(app)

    with patch(
        "app.api.tts._piper.synthesize",
        new=AsyncMock(return_value=fake_mp3),
    ):
        resp = client.post(
            "/api/tts/piper",
            json={"text": "Hello world", "model_name": "en_US-lessac-medium"},
        )

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert resp.content == fake_mp3


# ── IT-08-03: POST /api/tts/piper with empty text → 422 ─────────────────────

def test_piper_endpoint_rejects_empty_text():
    """POST /api/tts/piper returns 422 when text is blank."""
    app = create_app()
    client = TestClient(app, raise_server_exceptions=False)

    resp = client.post(
        "/api/tts/piper",
        json={"text": "   ", "model_name": "en_US-lessac-medium"},
    )

    assert resp.status_code == 422

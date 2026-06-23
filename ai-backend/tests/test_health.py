"""Integration tests for the health endpoint and FastAPI 422 validation.

Covers IT-01-01 and IT-01-02.
"""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.models.storyboard import VideoStoryboard


# ---------------------------------------------------------------------------
# IT-01-01: GET /health → HTTP 200, {"status": "ok"}
# ---------------------------------------------------------------------------

async def test_health_returns_ok(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "version" in body


async def test_health_status_is_string_ok(client: AsyncClient):
    """Smoke: status field is exactly the string 'ok'."""
    response = await client.get("/health")
    assert response.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# IT-01-02: POST with body missing required fields → HTTP 422 with
# field-level errors.
#
# We build a minimal FastAPI app with a POST /storyboard endpoint that
# accepts VideoStoryboard so we can test FastAPI's 422 validation path
# against our Pydantic models — without polluting the production app.
# ---------------------------------------------------------------------------

@pytest.fixture
async def storyboard_client() -> AsyncClient:
    """Minimal app with a single POST /storyboard endpoint for validation tests."""
    _app = FastAPI()

    @_app.post("/storyboard")
    async def create_storyboard(body: VideoStoryboard) -> dict:
        return {"received": True}

    async with AsyncClient(
        transport=ASGITransport(app=_app), base_url="http://test"
    ) as ac:
        yield ac


async def test_missing_required_field_returns_422(storyboard_client: AsyncClient):
    """POST body missing meta.title → 422 with field-level error."""
    body = {
        "meta": {
            # title is missing
            "aspectRatio": "9:16",
            "language": "en",
            "voiceId": "voice_abc",
        },
        "timeline": [
            {
                "sequenceNumber": 1,
                "narrationText": "Hello",
                "visualPrompt": "A wide shot of the city.",
            }
        ],
    }
    response = await storyboard_client.post("/storyboard", json=body)
    assert response.status_code == 422
    errors = response.json()["detail"]
    # FastAPI returns a list of field-level errors
    assert isinstance(errors, list)
    assert len(errors) > 0
    # At least one error references the missing field
    error_locs = [str(e["loc"]) for e in errors]
    assert any("title" in loc for loc in error_locs)


async def test_empty_timeline_returns_422(storyboard_client: AsyncClient):
    """POST body with empty timeline → 422."""
    body = {
        "meta": {
            "title": "Test",
            "aspectRatio": "9:16",
            "language": "en",
            "voiceId": "voice_abc",
        },
        "timeline": [],
    }
    response = await storyboard_client.post("/storyboard", json=body)
    assert response.status_code == 422

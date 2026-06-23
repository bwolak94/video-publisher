"""Test configuration.

Env vars are set BEFORE any app imports so pydantic-settings finds them.
"""
import os

# Set required env vars before importing app modules
os.environ.setdefault("OPENAI_API_KEY", "test-key-openai")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("APP_VERSION", "0.1.0")

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import app


@pytest.fixture(autouse=True)
def reset_settings_cache():
    """Clear lru_cache between tests so env-var mutations take effect."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

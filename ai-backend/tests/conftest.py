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


@pytest.fixture(autouse=True)
def reset_openai_singletons():
    """Reset module-level AsyncOpenAI singletons before each test.

    Ensures that patch("...AsyncOpenAI", return_value=mock) always triggers
    the constructor inside _get_client(), regardless of test execution order.
    """
    import app.agents.director.creator_mode as creator_mod
    import app.agents.researcher.script_research_agent as research_mod
    import app.services.reference_analyzer as ref_mod

    ref_mod._openai_client = None
    research_mod._openai_client = None
    creator_mod._openai_client = None
    yield
    ref_mod._openai_client = None
    research_mod._openai_client = None
    creator_mod._openai_client = None


@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

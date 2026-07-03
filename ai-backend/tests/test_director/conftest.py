"""Shared fixtures for test_director — replaces AsyncRedisSaver with MemorySaver."""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from langgraph.checkpoint.memory import MemorySaver


@pytest.fixture(autouse=True)
def patch_redis_checkpointer():
    """Replace AsyncRedisSaver with an in-memory checkpointer so tests need no Redis."""
    saver = MemorySaver()
    # MemorySaver has no asetup(); add a no-op so get_creator_graph() doesn't fail.
    saver.asetup = AsyncMock()

    @asynccontextmanager
    async def _mock_from_conn_string(*args, **kwargs):
        yield saver

    with patch(
        "app.agents.director.creator_mode.AsyncRedisSaver.from_conn_string",
        _mock_from_conn_string,
    ):
        yield

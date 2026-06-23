"""48-hour deduplication index backed by Redis.

Uses SHA-256 of the normalised topic title as the exact-match key.
A future enhancement (noted in TASK-02) can add simhash-based fuzzy matching
(cosine similarity > 0.85) without changing this interface.
"""
import hashlib

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger(__name__)

_KEY_PREFIX = "research_dedup:"


class DedupService:
    def __init__(self, redis_client: aioredis.Redis, window_hours: int = 48) -> None:
        self._redis = redis_client
        self._ttl_seconds = window_hours * 3600

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def is_duplicate(self, topic: str) -> bool:
        """Return True if this topic was seen within the dedup window."""
        key = self._make_key(topic)
        exists = bool(await self._redis.exists(key))
        if exists:
            logger.info("dedup_hit", topic=topic[:60])
        return exists

    async def mark_seen(self, topic: str) -> None:
        """Record the topic so future calls to is_duplicate return True."""
        key = self._make_key(topic)
        await self._redis.set(key, "1", ex=self._ttl_seconds)
        logger.debug("dedup_marked", topic=topic[:60], ttl_hours=self._ttl_seconds // 3600)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    @staticmethod
    def _make_key(topic: str) -> str:
        normalised = " ".join(topic.lower().split())
        digest = hashlib.sha256(normalised.encode()).hexdigest()
        return f"{_KEY_PREFIX}{digest}"

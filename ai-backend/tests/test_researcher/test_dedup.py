"""Unit tests for Redis dedup service — UT-02-05, UT-02-06."""
import fakeredis.aioredis
import pytest

from app.agents.researcher.dedup import DedupService


@pytest.fixture
def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.fixture
def dedup(fake_redis) -> DedupService:
    return DedupService(redis_client=fake_redis, window_hours=48)


# ─── UT-02-05: Topic with matching hash → is_duplicate returns True ───────────

async def test_is_duplicate_returns_true_when_key_exists(dedup: DedupService):
    """UT-02-05: After marking a topic, is_duplicate returns True."""
    topic = "OpenAI releases GPT-5"
    await dedup.mark_seen(topic)
    assert await dedup.is_duplicate(topic) is True


async def test_is_duplicate_case_insensitive(dedup: DedupService):
    """Normalisation: 'OPENAI releases gpt-5' equals 'openai releases gpt-5'."""
    await dedup.mark_seen("OpenAI releases GPT-5")
    assert await dedup.is_duplicate("OPENAI RELEASES GPT-5") is True


async def test_is_duplicate_whitespace_normalised(dedup: DedupService):
    """Extra whitespace is collapsed before hashing."""
    await dedup.mark_seen("AI  beats   chess")
    assert await dedup.is_duplicate("AI beats chess") is True


# ─── UT-02-06: Topic not in Redis → False, then writes hash ──────────────────

async def test_is_duplicate_returns_false_for_new_topic(dedup: DedupService, fake_redis):
    """UT-02-06: New topic → is_duplicate returns False."""
    topic = "Brand new topic never seen before"
    result = await dedup.is_duplicate(topic)
    assert result is False


async def test_mark_seen_writes_to_redis(dedup: DedupService, fake_redis):
    """UT-02-06: mark_seen stores hash in Redis so subsequent check returns True."""
    topic = "Tesla unveils new Cybertruck model"
    assert await dedup.is_duplicate(topic) is False

    await dedup.mark_seen(topic)

    assert await dedup.is_duplicate(topic) is True


async def test_different_topics_have_different_keys(dedup: DedupService):
    """Two distinct topics are stored independently."""
    await dedup.mark_seen("Topic A")
    assert await dedup.is_duplicate("Topic A") is True
    assert await dedup.is_duplicate("Topic B") is False


async def test_ttl_is_set_on_mark_seen(dedup: DedupService, fake_redis):
    """mark_seen sets a TTL of 48 hours on the Redis key."""
    topic = "Check TTL"
    await dedup.mark_seen(topic)
    key = DedupService._make_key(topic)
    ttl = await fake_redis.ttl(key)
    # TTL should be close to 48 * 3600 = 172800 seconds
    assert 172700 <= ttl <= 172800

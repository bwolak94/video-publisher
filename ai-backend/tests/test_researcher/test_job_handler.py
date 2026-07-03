"""Integration tests for ResearchJobHandler — IT-02-01, IT-02-02, IT-02-03."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import fakeredis.aioredis
import pytest

from app.agents.researcher.dedup import DedupService
from app.agents.researcher.job_handler import ResearchJobHandler
from app.models.research import NewsItem, ResearchJobPayload, ResearchReport, ViralityWeights

# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.fixture
def dedup(fake_redis) -> DedupService:
    return DedupService(redis_client=fake_redis, window_hours=48)


@pytest.fixture
def handler(dedup) -> ResearchJobHandler:
    return ResearchJobHandler(dedup=dedup)


def _make_payload(sources: list[str], min_score: float = 0.0) -> ResearchJobPayload:
    return ResearchJobPayload(
        channelId="chan-test",
        sources=sources,
        minViralityScore=min_score,
        viralityWeights=ViralityWeights(
            recency_weight=0.5,
            controversy_weight=0.2,
            momentum_weight=0.2,
            duplicate_penalty=0.1,
        ),
    )


def _make_news_item(title: str = "Breaking: AI beats experts") -> NewsItem:
    return NewsItem(
        title=title,
        url="https://example.com/article",
        publishedAt=datetime.now(UTC),
        source="Test Feed",
        content="Article content here.",
    )


def _make_report(channel_id: str = "chan-test") -> ResearchReport:
    return ResearchReport(
        channelId=channel_id,
        selectedTopic="Breaking: AI beats experts",
        viralityScore=0.85,
        keyFacts=["AI is improving rapidly"],
        sourceUrls=["https://example.com/article"],
        rawSummary="A new AI system...",
        generatedAt=datetime.now(UTC),
    )


# ─── IT-02-01: Happy path — one topic above threshold → valid ResearchReport ──

async def test_full_research_job_returns_report(handler: ResearchJobHandler):
    """IT-02-01: Mocked RSS returns articles; synthesize_report returns a report."""
    articles = [_make_news_item("Breaking: AI beats experts")]
    expected_report = _make_report()

    with (
        patch(
            "app.agents.researcher.job_handler.parse_rss_feed",
            new_callable=AsyncMock,
            return_value=articles,
        ),
        patch(
            "app.agents.researcher.job_handler.synthesize_report",
            new_callable=AsyncMock,
            return_value=expected_report,
        ),
    ):
        report = await handler.run(_make_payload(["https://rss.example.com"], min_score=0.0))

    assert report.skipped is False
    assert report.selectedTopic == "Breaking: AI beats experts"
    assert report.viralityScore is not None


# ─── IT-02-02: All topics below threshold → skipped report ────────────────────

async def test_full_research_job_skipped_when_below_threshold(handler: ResearchJobHandler):
    """IT-02-02: Virality threshold is high; no topic qualifies → skipped=True."""
    articles = [_make_news_item("Minor local news update")]

    with patch(
        "app.agents.researcher.job_handler.parse_rss_feed",
        new_callable=AsyncMock,
        return_value=articles,
    ):
        # minViralityScore=1.0 is impossible to reach → always skipped
        report = await handler.run(_make_payload(["https://rss.example.com"], min_score=1.0))

    assert report.skipped is True
    assert report.skipReason == "no_topic_above_threshold"
    assert report.selectedTopic is None


# ─── IT-02-03: One failing source → job completes from remaining sources ──────

async def test_research_job_continues_when_one_source_fails(handler: ResearchJobHandler):
    """IT-02-03: Source A raises exception; source B returns articles → report generated."""
    good_articles = [_make_news_item("Story from source B")]
    expected_report = _make_report()

    call_count = 0

    async def mock_parse_rss(url: str):
        nonlocal call_count
        call_count += 1
        if "bad-source" in url:
            raise ConnectionError("HTTP 503 Service Unavailable")
        return good_articles

    with (
        patch("app.agents.researcher.job_handler.parse_rss_feed", side_effect=mock_parse_rss),
        patch(
            "app.agents.researcher.job_handler.synthesize_report",
            new_callable=AsyncMock,
            return_value=expected_report,
        ),
    ):
        report = await handler.run(
            _make_payload(
                sources=["https://bad-source.example.com", "https://good-source.example.com"],
                min_score=0.0,
            )
        )

    # Both sources were attempted (circuit-breaker does not skip remaining)
    assert call_count == 2
    # Job completed successfully using the good source's articles
    assert report.skipped is False
    assert report.selectedTopic is not None


# ─── Edge: No articles fetched at all → skipped ───────────────────────────────

async def test_research_job_skipped_when_no_articles(handler: ResearchJobHandler):
    with patch(
        "app.agents.researcher.job_handler.parse_rss_feed",
        new_callable=AsyncMock,
        return_value=[],
    ):
        report = await handler.run(_make_payload(["https://rss.example.com"]))

    assert report.skipped is True
    assert report.skipReason == "no_articles_fetched"


# ─── Edge: All articles already deduped → skipped ────────────────────────────

async def test_research_job_skipped_when_all_duplicates(handler: ResearchJobHandler, dedup: DedupService):
    topic = "Already seen topic"
    await dedup.mark_seen(topic)

    articles = [_make_news_item(topic)]
    with patch(
        "app.agents.researcher.job_handler.parse_rss_feed",
        new_callable=AsyncMock,
        return_value=articles,
    ):
        report = await handler.run(_make_payload(["https://rss.example.com"]))

    assert report.skipped is True
    assert report.skipReason == "all_topics_are_recent_duplicates"

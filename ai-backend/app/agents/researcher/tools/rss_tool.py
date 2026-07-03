"""RSS feed parser tool.

Wraps feedparser (sync) in asyncio.to_thread so it doesn't block the event loop.
Circuit-breaker rule: exceptions are caught and logged; returns [] on failure.
"""
import asyncio
from datetime import UTC, datetime

import feedparser
import structlog

from app.models.research import NewsItem

logger = structlog.get_logger(__name__)


def _parse_feed_sync(url: str) -> list[NewsItem]:
    """Synchronous feedparser call — run via asyncio.to_thread."""
    try:
        feed = feedparser.parse(url)
        items: list[NewsItem] = []
        for entry in feed.entries:
            parsed_time = entry.get("published_parsed")
            if parsed_time:
                dt = datetime(*parsed_time[:6], tzinfo=UTC)
            else:
                dt = datetime.now(UTC)

            items.append(NewsItem(
                title=entry.get("title", "").strip(),
                url=entry.get("link", url),
                publishedAt=dt,
                source=feed.feed.get("title", url),
                content=entry.get("summary", ""),
            ))
        return items
    except Exception as exc:
        logger.warning("rss_parse_failed", url=url, error=str(exc))
        return []


async def parse_rss_feed(url: str) -> list[NewsItem]:
    """Parse an RSS/Atom feed and return a list of NewsItems.

    Returns an empty list on any error (circuit-breaker per task rule #6).
    """
    return await asyncio.to_thread(_parse_feed_sync, url)

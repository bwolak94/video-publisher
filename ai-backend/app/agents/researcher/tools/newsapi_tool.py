"""NewsAPI client tool.

Wraps newsapi-python (sync) in asyncio.to_thread.
Circuit-breaker: returns [] on any exception.
Requires NEWSAPI_KEY to be set in settings.
"""
import asyncio
from datetime import datetime, timezone

import structlog
from newsapi import NewsApiClient

from app.models.research import NewsItem

logger = structlog.get_logger(__name__)


def _fetch_sync(api_key: str, query: str, page_size: int = 20) -> list[NewsItem]:
    try:
        client = NewsApiClient(api_key=api_key)
        response = client.get_top_headlines(q=query, page_size=page_size, language="en")
        items: list[NewsItem] = []
        for article in response.get("articles", []):
            raw_dt = article.get("publishedAt")
            dt = (
                datetime.fromisoformat(raw_dt.replace("Z", "+00:00"))
                if raw_dt
                else datetime.now(timezone.utc)
            )
            items.append(NewsItem(
                title=article.get("title", "").strip(),
                url=article.get("url", ""),
                publishedAt=dt,
                source=article.get("source", {}).get("name", "NewsAPI"),
                content=article.get("description") or "",
            ))
        return items
    except Exception as exc:
        logger.warning("newsapi_fetch_failed", query=query, error=str(exc))
        return []


async def fetch_newsapi(api_key: str, query: str) -> list[NewsItem]:
    """Fetch top headlines matching `query` from NewsAPI."""
    return await asyncio.to_thread(_fetch_sync, api_key, query)

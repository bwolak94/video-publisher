"""GDELT API client tool (direct HTTP, no third-party GDELT library needed).

Circuit-breaker: returns [] on any exception.
"""
from datetime import UTC, datetime

import httpx
import structlog

from app.models.research import NewsItem

logger = structlog.get_logger(__name__)

_GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc"


async def fetch_gdelt(query: str, max_records: int = 10) -> list[NewsItem]:
    """Fetch recent articles matching `query` from the GDELT DOC 2.0 API."""
    params: dict[str, str | int] = {
        "query": query,
        "mode": "artlist",
        "maxrecords": max_records,
        "format": "json",
        "timespan": "48h",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(_GDELT_API, params=params)
            response.raise_for_status()
            data = response.json()

        items: list[NewsItem] = []
        for article in data.get("articles", []):
            items.append(NewsItem(
                title=article.get("title", "").strip(),
                url=article.get("url", ""),
                publishedAt=datetime.now(UTC),  # GDELT timestamp format varies
                source="GDELT",
                content=article.get("seendate", ""),
            ))
        return items
    except Exception as exc:
        logger.warning("gdelt_fetch_failed", query=query, error=str(exc))
        return []

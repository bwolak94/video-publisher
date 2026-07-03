"""Web search tool wrappers for FEATURE-05 — Web Research Phase Before Scripting.

Each tool follows the circuit-breaker pattern: on any exception it returns []
so one failing source never blocks the overall research pipeline.

Tool availability:
  - SerpApiTool   — Requires SERPAPI_KEY; highest quality Google results
  - RedditTool    — No key; uses public Reddit JSON search endpoint
  - DuckDuckGoTool — No key; uses DDG instant answers as baseline context
"""
from typing import Literal
from urllib.parse import quote_plus

import httpx
import structlog

from app.models.research_brief import ResearchSource

logger = structlog.get_logger(__name__)

_SOURCE_TYPE = Literal["google", "reddit", "news", "duckduckgo"]

_HEADERS = {
    "User-Agent": "AI-Video-Factory/1.0 (research-agent; contact@ai-video-factory.app)",
    "Accept": "application/json",
}


# ── SerpAPI (Google) ───────────────────────────────────────────────────────────

async def search_serpapi(query: str, api_key: str, limit: int = 10) -> list[ResearchSource]:
    """Search Google via SerpAPI. Requires SERPAPI_KEY."""
    url = (
        f"https://serpapi.com/search.json"
        f"?q={quote_plus(query)}&api_key={api_key}&num={limit}&engine=google&hl=en"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=_HEADERS)
            res.raise_for_status()
            data = res.json()

        results: list[ResearchSource] = []
        for item in data.get("organic_results", [])[:limit]:
            results.append(ResearchSource(
                url=item.get("link", ""),
                title=item.get("title", ""),
                snippet=item.get("snippet", ""),
                source="google",
            ))
        logger.info("serpapi_search_ok", query=query, count=len(results))
        return results
    except Exception as exc:
        logger.warning("serpapi_search_failed", query=query, error=str(exc))
        return []


# ── Reddit (no key required) ───────────────────────────────────────────────────

async def search_reddit(query: str, limit: int = 10) -> list[ResearchSource]:
    """Search Reddit using the public JSON endpoint. No API key required."""
    url = (
        f"https://www.reddit.com/search.json"
        f"?q={quote_plus(query)}&sort=relevance&limit={limit}&t=month&type=link"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers={**_HEADERS, "Accept": "application/json"})
            res.raise_for_status()
            data = res.json()

        results: list[ResearchSource] = []
        for post in data.get("data", {}).get("children", [])[:limit]:
            p = post.get("data", {})
            results.append(ResearchSource(
                url=f"https://reddit.com{p.get('permalink', '')}",
                title=p.get("title", ""),
                snippet=p.get("selftext", "")[:300] or p.get("title", ""),
                source="reddit",
            ))
        logger.info("reddit_search_ok", query=query, count=len(results))
        return results
    except Exception as exc:
        logger.warning("reddit_search_failed", query=query, error=str(exc))
        return []


# ── DuckDuckGo instant answers (no key, zero-dependency fallback) ──────────────

async def search_duckduckgo(query: str, limit: int = 8) -> list[ResearchSource]:
    """DuckDuckGo instant answer API — zero-key baseline context."""
    url = (
        f"https://api.duckduckgo.com/"
        f"?q={quote_plus(query)}&format=json&no_html=1&skip_disambig=1"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers=_HEADERS)
            res.raise_for_status()
            data = res.json()

        results: list[ResearchSource] = []

        # AbstractText is the featured snippet
        if data.get("AbstractText") and data.get("AbstractURL"):
            results.append(ResearchSource(
                url=data["AbstractURL"],
                title=data.get("Heading", query),
                snippet=data["AbstractText"][:400],
                source="duckduckgo",
            ))

        # RelatedTopics give secondary results
        for topic in data.get("RelatedTopics", [])[:limit - 1]:
            if not isinstance(topic, dict):
                continue
            # Skip category headings (they have a "Topics" sub-list)
            if "Topics" in topic:
                continue
            first_url = topic.get("FirstURL", "")
            text = topic.get("Text", "")
            if first_url and text:
                results.append(ResearchSource(
                    url=first_url,
                    title=text[:80],
                    snippet=text[:400],
                    source="duckduckgo",
                ))

        logger.info("duckduckgo_search_ok", query=query, count=len(results))
        return results
    except Exception as exc:
        logger.warning("duckduckgo_search_failed", query=query, error=str(exc))
        return []


# ── NewsAPI ────────────────────────────────────────────────────────────────────

async def search_newsapi(query: str, api_key: str, limit: int = 10) -> list[ResearchSource]:
    """Search via NewsAPI. Requires NEWSAPI_KEY."""
    url = (
        f"https://newsapi.org/v2/everything"
        f"?q={quote_plus(query)}&sortBy=relevancy&pageSize={limit}&language=en"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get(url, headers={**_HEADERS, "Authorization": f"Bearer {api_key}"})
            res.raise_for_status()
            data = res.json()

        results: list[ResearchSource] = []
        for article in data.get("articles", [])[:limit]:
            results.append(ResearchSource(
                url=article.get("url", ""),
                title=article.get("title", ""),
                snippet=article.get("description") or article.get("title", ""),
                source="news",
                publishedAt=article.get("publishedAt"),
            ))
        logger.info("newsapi_search_ok", query=query, count=len(results))
        return results
    except Exception as exc:
        logger.warning("newsapi_search_failed", query=query, error=str(exc))
        return []

"""Script Research Agent — FEATURE-05: Web Research Phase Before Scripting.

Conducts structured multi-source web research before Director Agent generates
an outline. Produces a ResearchBrief that is injected into the outline prompt
to ground the content in real data, trends, and audience interests.

Pipeline:
  1. Generate N query variations for the topic (no LLM needed — deterministic)
  2. Run all searches in parallel across available sources (circuit-breaker per source)
  3. Deduplicate results by URL
  4. Synthesize ResearchBrief via LLM (cheap model, sanitised input)
"""
import asyncio
import json
from typing import Literal

import structlog
from openai import AsyncOpenAI

from app.agents.researcher.sanitizer import sanitize_content
from app.agents.researcher.web_search_tools import (
    search_duckduckgo,
    search_newsapi,
    search_reddit,
    search_serpapi,
)
from app.models.research_brief import ResearchBrief, ResearchSource

logger = structlog.get_logger(__name__)

SearchDepth = Literal["quick", "standard", "deep"]

_DEPTH_QUERY_COUNTS = {"quick": 5, "standard": 15, "deep": 25}


def _generate_queries(topic: str, depth: SearchDepth) -> list[str]:
    """Deterministically generate query variations — no LLM, no cost."""
    base = [
        topic,
        f"{topic} how to",
        f"{topic} explained",
        f"{topic} tips",
        f"{topic} 2025",
    ]
    standard_extra = [
        f"best {topic}",
        f"{topic} mistakes to avoid",
        f"{topic} guide beginners",
        f"{topic} trends",
        f"{topic} common questions",
        f"why {topic}",
        f"{topic} vs",
        f"{topic} pros cons",
        f"{topic} examples",
        f"{topic} tutorial",
    ]
    deep_extra = [
        f"{topic} research",
        f"{topic} statistics",
        f"{topic} case study",
        f"{topic} expert opinion",
        f"{topic} controversy",
        f"{topic} future",
        f"{topic} history",
        f"{topic} reddit",
        f"{topic} review",
        f"{topic} reddit discussion",
    ]

    all_queries = base
    if depth in ("standard", "deep"):
        all_queries += standard_extra
    if depth == "deep":
        all_queries += deep_extra

    limit = _DEPTH_QUERY_COUNTS[depth]
    return all_queries[:limit]


async def _run_searches(
    queries: list[str],
    serpapi_key: str | None,
    newsapi_key: str | None,
) -> list[ResearchSource]:
    """Run all searches in parallel; circuit-breaker per source."""
    tasks = []

    for query in queries:
        # Always search Reddit (no key) and DuckDuckGo (no key)
        tasks.append(search_reddit(query, limit=3))
        tasks.append(search_duckduckgo(query, limit=3))

        if serpapi_key:
            tasks.append(search_serpapi(query, serpapi_key, limit=5))
        if newsapi_key:
            tasks.append(search_newsapi(query, newsapi_key, limit=3))

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    all_sources: list[ResearchSource] = []
    for result in raw_results:
        if isinstance(result, list):
            all_sources.extend(result)
        # Exception = circuit-breaker already fired inside each tool; safe to skip

    return all_sources


def _deduplicate(sources: list[ResearchSource]) -> list[ResearchSource]:
    """Deduplicate by URL, preserving first occurrence."""
    seen: set[str] = set()
    unique: list[ResearchSource] = []
    for s in sources:
        if s.url and s.url not in seen:
            seen.add(s.url)
            unique.append(s)
    return unique


async def _synthesize(topic: str, sources: list[ResearchSource], depth: SearchDepth) -> ResearchBrief:
    """Synthesize a ResearchBrief from deduplicated sources via cheap LLM."""
    # Truncate to top 20 sources to keep prompt small
    top_sources = sources[:20]

    content_lines = [
        f"URL: {s.url}\nTitle: {s.title}\nSnippet: {s.snippet}"
        for s in top_sources
    ]
    sanitized = sanitize_content("\n\n---\n\n".join(content_lines))

    system_prompt = (
        "You are a research analyst synthesizing web research into a structured brief for video scriptwriting. "
        "Return ONLY valid JSON matching the schema exactly. No markdown, no explanation."
    )
    user_prompt = (
        f"Topic: {topic}\n\n"
        f"Research sources:\n<research_data>\n{sanitized}\n</research_data>\n\n"
        "Synthesize a ResearchBrief JSON with these keys:\n"
        '  "keyPoints": list of 5-8 key factual findings (concise, specific)\n'
        '  "trendingAngles": list of 3 content angles trending now\n'
        '  "audienceInsights": list of 3-5 things audiences ask/complain about\n\n'
        'Return ONLY: {"keyPoints": [...], "trendingAngles": [...], "audienceInsights": [...]}'
    )

    try:
        client = AsyncOpenAI()
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=800,
        )
        raw = response.choices[0].message.content or "{}"
        # Strip markdown fences if present
        if raw.strip().startswith("```"):
            parts = raw.split("```")
            raw = parts[1].removeprefix("json").strip() if len(parts) > 1 else raw

        parsed = json.loads(raw)
    except Exception as exc:
        logger.warning("research_synthesis_failed", error=str(exc))
        parsed = {}

    return ResearchBrief(
        topic=topic,
        keyPoints=parsed.get("keyPoints", [f"Research conducted on: {topic}"]),
        trendingAngles=parsed.get("trendingAngles", []),
        audienceInsights=parsed.get("audienceInsights", []),
        sources=top_sources[:10],  # Store top 10 sources in brief
        searchDepth=depth,
        searchCount=len(sources),
    )


async def run_script_research(
    topic: str,
    depth: SearchDepth = "standard",
    serpapi_key: str | None = None,
    newsapi_key: str | None = None,
) -> ResearchBrief:
    """Full research pipeline: generate queries → search → dedup → synthesize.

    Always succeeds — returns a minimal brief even on total failure.
    """
    logger.info("script_research_start", topic=topic, depth=depth)

    queries = _generate_queries(topic, depth)
    logger.info("script_research_queries", count=len(queries))

    raw_sources = await _run_searches(queries, serpapi_key, newsapi_key)
    unique_sources = _deduplicate(raw_sources)

    logger.info("script_research_sources", total=len(raw_sources), unique=len(unique_sources))

    brief = await _synthesize(topic, unique_sources, depth)

    logger.info(
        "script_research_done",
        topic=topic,
        depth=depth,
        sources=len(unique_sources),
        key_points=len(brief.keyPoints),
    )
    return brief

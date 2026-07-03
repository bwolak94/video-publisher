"""Research job orchestrator.

Implements the full Worker Mode research pipeline:
  1. Fetch articles from all sources in parallel (circuit-breaker per source)
  2. Sanitise all content before any LLM exposure
  3. Deduplicate against Redis 48h window
  4. Score each candidate with the virality formula
  5. If top score < minViralityScore → return skipped report (rule #3)
  6. Synthesise report via CrewAI agent (cheap LLM, sanitised input)
  7. Mark winning topic as seen in dedup store

Called from POST /api/research/run (app/api/research.py).
"""
import asyncio
from datetime import UTC, datetime

import structlog

from app.agents.researcher.agent import synthesize_report
from app.agents.researcher.dedup import DedupService
from app.agents.researcher.sanitizer import sanitize_content
from app.agents.researcher.scoring import calculate_virality_score, compute_recency_score
from app.agents.researcher.tools.rss_tool import parse_rss_feed
from app.models.research import NewsItem, ResearchJobPayload, ResearchReport, ViralityWeights

logger = structlog.get_logger(__name__)


class ResearchJobHandler:
    def __init__(self, dedup: DedupService) -> None:
        self._dedup = dedup

    async def run(self, payload: ResearchJobPayload) -> ResearchReport:
        logger.info("research_job_started", channel_id=payload.channelId, sources=len(payload.sources))

        # ── Step 1: Fetch from all RSS sources in parallel ──────────────────
        # return_exceptions=True implements the circuit-breaker: one failing
        # source does not block or fail the others (task rule #6).
        fetch_tasks = [parse_rss_feed(url) for url in payload.sources]
        raw_results = await asyncio.gather(*fetch_tasks, return_exceptions=True)

        articles: list[NewsItem] = []
        for url, result in zip(payload.sources, raw_results):
            if isinstance(result, BaseException):
                logger.warning("source_fetch_failed", source=url, error=str(result))
            else:
                articles.extend(result)

        if not articles:
            logger.info("research_job_skipped", reason="no_articles_fetched")
            return self._skipped(payload.channelId, "no_articles_fetched")

        # ── Steps 2-4: Dedup + score ─────────────────────────────────────────
        now = datetime.now(UTC)
        weights: ViralityWeights = payload.viralityWeights
        scored: list[tuple[float, NewsItem]] = []

        for article in articles:
            if await self._dedup.is_duplicate(article.title):
                continue

            recency = compute_recency_score(article.publishedAt, now, payload.deduplicationWindowHours)

            # sentiment_polarity: heuristic — proportion of ALL-CAPS words in title,
            # normalised to [0, 1]. Controversy correlates with strong language.
            # A production implementation would use a sentiment model.
            words = article.title.split()
            caps_ratio = sum(1 for w in words if w.isupper()) / max(len(words), 1)
            sentiment = min(1.0, caps_ratio * 2.0)

            # publication_velocity: normalised article count (proxy for topic momentum).
            # Capped at 1.0 when 50+ articles fetched.
            velocity = min(1.0, len(articles) / 50.0)

            score = calculate_virality_score(
                recency_score=recency,
                sentiment_polarity=sentiment,
                publication_velocity=velocity,
                similarity_to_recent=0.0,  # exact dedup already applied above
                weights=weights,
            )
            scored.append((score, article))

        if not scored:
            logger.info("research_job_skipped", reason="all_topics_are_recent_duplicates")
            return self._skipped(payload.channelId, "all_topics_are_recent_duplicates")

        # ── Step 5: Threshold check (task rule #3 — no bypass) ───────────────
        top_score, top_article = max(scored, key=lambda x: x[0])
        if top_score < payload.minViralityScore:
            logger.info("research_job_skipped", reason="no_topic_above_threshold", top_score=top_score)
            return self._skipped(payload.channelId, "no_topic_above_threshold")

        # ── Step 6: LLM synthesis (CrewAI, sanitised content) ────────────────
        sanitized = sanitize_content(
            f"Title: {top_article.title}\n"
            f"Content: {top_article.content}\n"
            f"URL: {top_article.url}"
        )
        report = await synthesize_report(
            channel_id=payload.channelId,
            topic=top_article.title,
            sanitized_content=sanitized,
            virality_score=top_score,
            source_url=top_article.url,
        )

        # ── Step 7: Mark as seen ──────────────────────────────────────────────
        await self._dedup.mark_seen(top_article.title)

        logger.info(
            "research_job_completed",
            channel_id=payload.channelId,
            topic=top_article.title,
            score=top_score,
        )
        return report

    @staticmethod
    def _skipped(channel_id: str, reason: str) -> ResearchReport:
        return ResearchReport(
            channelId=channel_id,
            skipped=True,
            skipReason=reason,
            generatedAt=datetime.now(UTC),
        )

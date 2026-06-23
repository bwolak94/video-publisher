"""Google Trends interest score tool.

Returns a normalised 0-1 interest score for a keyword over the last 48 hours.
Wraps pytrends (sync) in asyncio.to_thread.
Circuit-breaker: returns 0.0 on any exception.
"""
import asyncio

import structlog

logger = structlog.get_logger(__name__)


def _fetch_interest_sync(keyword: str) -> float:
    try:
        from pytrends.request import TrendReq
        pytrends = TrendReq(hl="en-US", tz=360)
        pytrends.build_payload([keyword], timeframe="now 2-d")
        df = pytrends.interest_over_time()
        if df.empty or keyword not in df.columns:
            return 0.0
        # Google Trends returns 0-100; normalise to 0-1
        return float(df[keyword].iloc[-1]) / 100.0
    except Exception as exc:
        logger.warning("trends_fetch_failed", keyword=keyword, error=str(exc))
        return 0.0


async def fetch_trends(keyword: str) -> float:
    """Return a 0-1 Google Trends interest score for the keyword."""
    return await asyncio.to_thread(_fetch_interest_sync, keyword)

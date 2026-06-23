"""Unit tests for RSS feed parser tool — UT-02-03, UT-02-04."""
import time
from unittest.mock import MagicMock, patch

import pytest

from app.agents.researcher.tools.rss_tool import _parse_feed_sync


# ─── UT-02-03: Valid feed → list of NewsItems ─────────────────────────────────

def _make_feed_mock(entries: list[dict]) -> MagicMock:
    feed_mock = MagicMock()
    feed_mock.feed.title = "Test Feed"
    feed_mock.entries = []
    for e in entries:
        entry = MagicMock()
        entry.title = e.get("title", "")
        entry.link = e.get("link", "https://example.com")
        entry.summary = e.get("summary", "")
        entry.get = lambda key, default=None, _e=e: _e.get(key, default)
        # published_parsed: time.struct_time tuple
        entry.published_parsed = e.get("published_parsed")
        feed_mock.entries.append(entry)
    return feed_mock


def test_parse_rss_feed_valid():
    """UT-02-03: Returns a list of NewsItem objects from a mocked valid feed."""
    published = time.gmtime()  # current time as struct_time
    mock_feed = MagicMock()
    mock_feed.feed.get = lambda key, default=None: {"title": "Tech News"}.get(key, default)
    entry = MagicMock()
    entry.get = lambda key, default=None: {
        "title": "AI beats humans at chess",
        "link": "https://example.com/ai-chess",
        "summary": "A new AI system defeats chess grandmasters.",
        "published_parsed": published,
    }.get(key, default)
    mock_feed.entries = [entry]

    with patch("app.agents.researcher.tools.rss_tool.feedparser.parse", return_value=mock_feed):
        items = _parse_feed_sync("https://example.com/rss")

    assert len(items) == 1
    assert items[0].title == "AI beats humans at chess"
    assert items[0].url == "https://example.com/ai-chess"
    assert items[0].source == "Tech News"


def test_parse_rss_feed_multiple_entries():
    """Multiple entries in feed → multiple NewsItems."""
    mock_feed = MagicMock()
    mock_feed.feed.get = lambda key, default=None: {"title": "Feed"}.get(key, default)

    entries = []
    for i in range(3):
        e = MagicMock()
        e.get = lambda key, default=None, idx=i: {
            "title": f"Article {idx}",
            "link": f"https://example.com/{idx}",
            "summary": "",
            "published_parsed": None,
        }.get(key, default)
        entries.append(e)
    mock_feed.entries = entries

    with patch("app.agents.researcher.tools.rss_tool.feedparser.parse", return_value=mock_feed):
        items = _parse_feed_sync("https://example.com/rss")

    assert len(items) == 3


# ─── UT-02-04: Malformed XML / exception → empty list, logs warning ───────────

def test_parse_rss_feed_exception_returns_empty():
    """UT-02-04: feedparser raises → returns [], does not re-raise."""
    with patch(
        "app.agents.researcher.tools.rss_tool.feedparser.parse",
        side_effect=Exception("connection refused"),
    ):
        items = _parse_feed_sync("https://bad-feed.example.com/rss")

    assert items == []


def test_parse_rss_feed_empty_feed_returns_empty():
    """Feed with no entries → empty list."""
    mock_feed = MagicMock()
    mock_feed.feed.get = lambda key, default=None: {}.get(key, default)
    mock_feed.entries = []

    with patch("app.agents.researcher.tools.rss_tool.feedparser.parse", return_value=mock_feed):
        items = _parse_feed_sync("https://example.com/rss")

    assert items == []

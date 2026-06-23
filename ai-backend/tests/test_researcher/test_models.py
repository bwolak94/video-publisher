"""Unit tests for ResearchReport model — UT-02-08."""
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.research import ResearchReport, ResearchJobPayload, ViralityWeights


# ─── UT-02-08: ResearchReport with missing required field raises ValidationError

def test_research_report_missing_channel_id():
    """channelId is required — omitting it raises ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        ResearchReport(
            # channelId intentionally omitted
            generatedAt=datetime.now(timezone.utc),
        )
    errors = exc_info.value.errors()
    assert any("channelId" in str(e["loc"]) for e in errors)


def test_research_report_missing_generated_at():
    """generatedAt is required — omitting it raises ValidationError."""
    with pytest.raises(ValidationError):
        ResearchReport(channelId="chan-123")


def test_research_report_virality_score_out_of_range():
    """viralityScore must be in [0, 1]."""
    with pytest.raises(ValidationError):
        ResearchReport(
            channelId="chan-123",
            viralityScore=1.5,
            generatedAt=datetime.now(timezone.utc),
        )


def test_research_report_valid_minimal():
    """Minimal valid report (skipped=True) parses without error."""
    report = ResearchReport(
        channelId="chan-abc",
        skipped=True,
        skipReason="no_topic_above_threshold",
        generatedAt=datetime.now(timezone.utc),
    )
    assert report.skipped is True
    assert report.selectedTopic is None


def test_research_report_valid_full():
    """Full report with all optional fields set."""
    report = ResearchReport(
        channelId="chan-xyz",
        selectedTopic="OpenAI launches GPT-5",
        viralityScore=0.87,
        keyFacts=["GPT-5 outperforms GPT-4", "Released today"],
        sourceUrls=["https://example.com/gpt5"],
        rawSummary="OpenAI announced GPT-5 today.",
        generatedAt=datetime.now(timezone.utc),
    )
    assert report.viralityScore == 0.87
    assert len(report.keyFacts) == 2


# ─── ResearchJobPayload ────────────────────────────────────────────────────────

def test_job_payload_defaults():
    payload = ResearchJobPayload(
        channelId="chan-1",
        sources=["https://rss.example.com/feed"],
    )
    assert payload.minViralityScore == 0.65
    assert payload.deduplicationWindowHours == 48
    assert isinstance(payload.viralityWeights, ViralityWeights)


def test_job_payload_min_virality_score_out_of_range():
    with pytest.raises(ValidationError):
        ResearchJobPayload(
            channelId="chan-1",
            sources=[],
            minViralityScore=1.5,
        )


def test_virality_weights_defaults():
    w = ViralityWeights()
    assert w.recency_weight == 0.25
    assert w.controversy_weight == 0.25
    assert w.momentum_weight == 0.25
    assert w.duplicate_penalty == 0.25

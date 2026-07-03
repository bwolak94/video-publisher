"""Pydantic v2 models for the Researcher Agent pipeline."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NewsItem(BaseModel):
    """A single article fetched from any news source."""
    model_config = ConfigDict(populate_by_name=True)

    title: str
    url: str
    publishedAt: datetime
    source: str
    content: str = ""


class ViralityWeights(BaseModel):
    """Per-channel virality scoring weights. Defaults match PRD (all 0.25)."""
    model_config = ConfigDict(populate_by_name=True)

    recency_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    controversy_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    momentum_weight: float = Field(default=0.25, ge=0.0, le=1.0)
    duplicate_penalty: float = Field(default=0.25, ge=0.0, le=1.0)


class ResearchJobPayload(BaseModel):
    """Payload dispatched by Node.js BullMQ research queue worker."""
    model_config = ConfigDict(populate_by_name=True)

    jobType: Literal["research"] = "research"
    channelId: str
    sources: list[str]                  # RSS feed URLs
    deduplicationWindowHours: int = 48
    minViralityScore: float = Field(0.65, ge=0.0, le=1.0)
    viralityWeights: ViralityWeights = Field(default_factory=ViralityWeights)
    # Optional enrichment sources — disabled by default (require API keys)
    newsApiEnabled: bool = False
    gdeltEnabled: bool = False
    trendsEnabled: bool = False


class ResearchReport(BaseModel):
    """Output of the Researcher Agent — Single Source of Truth for the Director Agent."""
    model_config = ConfigDict(populate_by_name=True)

    channelId: str
    skipped: bool = False
    skipReason: str | None = None
    selectedTopic: str | None = None
    viralityScore: float | None = Field(None, ge=0.0, le=1.0)
    keyFacts: list[str] = []
    sourceUrls: list[str] = []
    rawSummary: str | None = None
    generatedAt: datetime

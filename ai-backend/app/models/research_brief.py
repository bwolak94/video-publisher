"""Pydantic v2 models for FEATURE-05 — Web Research Phase Before Scripting."""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ResearchSource(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    url: str
    title: str
    snippet: str
    source: Literal["google", "reddit", "news", "duckduckgo"]
    publishedAt: Optional[str] = None


class ResearchBrief(BaseModel):
    """Synthesized research output fed into Director Agent as context."""
    model_config = ConfigDict(populate_by_name=True)

    topic: str
    keyPoints: list[str] = Field(default_factory=list)
    trendingAngles: list[str] = Field(default_factory=list)
    audienceInsights: list[str] = Field(default_factory=list)
    sources: list[ResearchSource] = Field(default_factory=list)
    searchDepth: Literal["quick", "standard", "deep"] = "standard"
    searchCount: int = 0
    generatedAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

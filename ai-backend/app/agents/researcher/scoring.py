"""Virality scoring algorithm.

PRD Formula (Section 3.1):
  score = (recency_weight    × recency_score)
        + (controversy_weight × sentiment_polarity)
        + (momentum_weight    × publication_velocity)
        - (duplicate_penalty  × similarity_to_recent)

All inputs are in [0, 1]. Output is clamped to [0, 1].
Weights are read from the channel's NicheProfile (TASK-06); defaults are 0.25 each.
"""
from datetime import datetime, timezone

from app.models.research import ViralityWeights


def compute_recency_score(
    published_at: datetime,
    now: datetime | None = None,
    window_hours: int = 48,
) -> float:
    """Return 1.0 if published now, 0.0 if published window_hours ago or earlier."""
    if now is None:
        now = datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_hours = (now - published_at).total_seconds() / 3600.0
    return max(0.0, 1.0 - (age_hours / window_hours))


def calculate_virality_score(
    recency_score: float,
    sentiment_polarity: float,
    publication_velocity: float,
    similarity_to_recent: float,
    weights: ViralityWeights,
) -> float:
    """Apply the PRD virality formula and return a score clamped to [0, 1]."""
    raw = (
        weights.recency_weight * recency_score
        + weights.controversy_weight * sentiment_polarity
        + weights.momentum_weight * publication_velocity
        - weights.duplicate_penalty * similarity_to_recent
    )
    return max(0.0, min(1.0, raw))

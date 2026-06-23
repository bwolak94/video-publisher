"""Unit tests for virality scoring — UT-02-01, UT-02-02."""
from datetime import datetime, timedelta, timezone

import pytest

from app.agents.researcher.scoring import calculate_virality_score, compute_recency_score
from app.models.research import ViralityWeights


# ─── UT-02-01: All weights = 0.25, known inputs → expected float ──────────────

def test_virality_score_equal_weights():
    weights = ViralityWeights(
        recency_weight=0.25,
        controversy_weight=0.25,
        momentum_weight=0.25,
        duplicate_penalty=0.25,
    )
    score = calculate_virality_score(
        recency_score=0.8,
        sentiment_polarity=0.6,
        publication_velocity=0.4,
        similarity_to_recent=0.0,
        weights=weights,
    )
    expected = 0.25 * 0.8 + 0.25 * 0.6 + 0.25 * 0.4 - 0.25 * 0.0
    assert abs(score - expected) < 1e-9


def test_virality_score_clamped_to_zero_when_negative():
    """If duplicate_penalty dominates, score is clamped to 0, not negative."""
    weights = ViralityWeights(
        recency_weight=0.1,
        controversy_weight=0.1,
        momentum_weight=0.1,
        duplicate_penalty=1.0,
    )
    score = calculate_virality_score(
        recency_score=0.0,
        sentiment_polarity=0.0,
        publication_velocity=0.0,
        similarity_to_recent=1.0,
        weights=weights,
    )
    assert score == 0.0


def test_virality_score_clamped_to_one():
    weights = ViralityWeights(
        recency_weight=1.0,
        controversy_weight=0.0,
        momentum_weight=0.0,
        duplicate_penalty=0.0,
    )
    score = calculate_virality_score(
        recency_score=2.0,    # intentionally > 1
        sentiment_polarity=0.0,
        publication_velocity=0.0,
        similarity_to_recent=0.0,
        weights=weights,
    )
    assert score == 1.0


# ─── UT-02-02: High duplicate_penalty → score drops significantly ─────────────

def test_virality_score_high_duplicate_penalty_drops_score():
    base_weights = ViralityWeights(
        recency_weight=0.25,
        controversy_weight=0.25,
        momentum_weight=0.25,
        duplicate_penalty=0.25,
    )
    high_penalty_weights = ViralityWeights(
        recency_weight=0.25,
        controversy_weight=0.25,
        momentum_weight=0.25,
        duplicate_penalty=1.0,
    )
    inputs = dict(
        recency_score=0.8,
        sentiment_polarity=0.6,
        publication_velocity=0.4,
        similarity_to_recent=0.9,  # near-duplicate
    )
    base_score = calculate_virality_score(**inputs, weights=base_weights)
    penalised_score = calculate_virality_score(**inputs, weights=high_penalty_weights)

    assert penalised_score < base_score
    # penalty=1.0 × similarity=0.9 drives raw score negative → clamped to 0.0
    # base_score ≈ 0.225, penalised_score = 0.0 → drop > 0.15
    assert (base_score - penalised_score) > 0.15
    assert penalised_score == 0.0


# ─── recency_score helper ──────────────────────────────────────────────────────

def test_recency_score_just_published():
    now = datetime.now(timezone.utc)
    score = compute_recency_score(published_at=now, now=now)
    assert score == pytest.approx(1.0)


def test_recency_score_48h_old_is_zero():
    now = datetime.now(timezone.utc)
    old = now - timedelta(hours=48)
    score = compute_recency_score(published_at=old, now=now, window_hours=48)
    assert score == pytest.approx(0.0)


def test_recency_score_24h_old_is_half():
    now = datetime.now(timezone.utc)
    published = now - timedelta(hours=24)
    score = compute_recency_score(published_at=published, now=now, window_hours=48)
    assert score == pytest.approx(0.5)


def test_recency_score_older_than_window_clamped_to_zero():
    now = datetime.now(timezone.utc)
    old = now - timedelta(hours=100)
    score = compute_recency_score(published_at=old, now=now, window_hours=48)
    assert score == 0.0


def test_recency_score_naive_datetime_treated_as_utc():
    now = datetime.now(timezone.utc)
    naive = now.replace(tzinfo=None)
    score = compute_recency_score(published_at=naive, now=now)
    assert score == pytest.approx(1.0, abs=0.01)

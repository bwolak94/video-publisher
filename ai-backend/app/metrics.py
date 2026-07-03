"""Prometheus metrics registry for ai-backend."""
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

registry = CollectorRegistry()

# ── Counters ────────────────────────────────────────────────────────────────

research_requests_total = Counter(
    "research_requests_total",
    "Total research API requests processed, by status",
    ["status"],
    registry=registry,
)

external_api_errors_total = Counter(
    "external_api_errors_total",
    "Total external API errors, by service",
    ["service"],
    registry=registry,
)

# ── Histograms ───────────────────────────────────────────────────────────────

research_duration_seconds = Histogram(
    "research_duration_seconds",
    "Research pipeline duration in seconds",
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120],
    registry=registry,
)

external_api_duration_seconds = Histogram(
    "external_api_duration_seconds",
    "External API call duration in seconds",
    ["service", "endpoint"],
    buckets=[0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registry=registry,
)

# ── Gauges ───────────────────────────────────────────────────────────────────

active_crew_agents = Gauge(
    "active_crew_agents",
    "Number of currently running CrewAI agents",
    registry=registry,
)


def metrics_output() -> tuple[bytes, str]:
    """Return (body, content_type) for the /metrics endpoint."""
    return generate_latest(registry), CONTENT_TYPE_LATEST

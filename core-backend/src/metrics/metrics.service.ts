import { Injectable } from "@nestjs/common";
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // ── Counters ────────────────────────────────────────────────────────────────

  readonly pipelineJobsTotal = new Counter({
    name: "pipeline_jobs_total",
    help: "Total pipeline jobs processed, by queue and status",
    labelNames: ["queue", "status"] as const,
    registers: [this.registry],
  });

  readonly externalApiErrorsTotal = new Counter({
    name: "external_api_errors_total",
    help: "Total external API errors, by service",
    labelNames: ["service"] as const,
    registers: [this.registry],
  });

  readonly cacheHitsTotal = new Counter({
    name: "cache_hits_total",
    help: "Total cache hits, by cache type",
    labelNames: ["cache"] as const,
    registers: [this.registry],
  });

  readonly cacheMissesTotal = new Counter({
    name: "cache_misses_total",
    help: "Total cache misses, by cache type",
    labelNames: ["cache"] as const,
    registers: [this.registry],
  });

  readonly apiCostUsdTotal = new Counter({
    name: "api_cost_usd_total",
    help: "Total external API cost in USD, by service",
    labelNames: ["service"] as const,
    registers: [this.registry],
  });

  // ── Histograms ──────────────────────────────────────────────────────────────

  readonly pipelineJobDurationSeconds = new Histogram({
    name: "pipeline_job_duration_seconds",
    help: "Pipeline job processing duration in seconds",
    labelNames: ["queue"] as const,
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300],
    registers: [this.registry],
  });

  readonly externalApiDurationSeconds = new Histogram({
    name: "external_api_duration_seconds",
    help: "External API call duration in seconds",
    labelNames: ["service", "endpoint"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  // ── Gauges ──────────────────────────────────────────────────────────────────

  readonly queueDepth = new Gauge({
    name: "queue_depth",
    help: "Current number of waiting jobs in each queue",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  readonly activeWebsocketConnections = new Gauge({
    name: "active_websocket_connections",
    help: "Number of currently active WebSocket connections",
    registers: [this.registry],
  });

  readonly dlqDepth = new Gauge({
    name: "dlq_depth",
    help: "Number of jobs in the dead-letter queue",
    labelNames: ["queue"] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}

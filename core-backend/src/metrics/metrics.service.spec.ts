/**
 * Unit tests for MetricsService — UT-26-01 to UT-26-04
 */
import { Test } from "@nestjs/testing";
import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    service = module.get(MetricsService);
  });

  // UT-26-01: counter increments
  it("increments pipeline_jobs_total counter (UT-26-01)", async () => {
    service.pipelineJobsTotal.inc({ queue: "asset-generation", status: "completed" });
    service.pipelineJobsTotal.inc({ queue: "asset-generation", status: "completed" });
    const metrics = await service.getMetrics();
    expect(metrics).toMatch(/pipeline_jobs_total.*2/);
  });

  // UT-26-02: histogram observe
  it("records pipeline_job_duration_seconds histogram (UT-26-02)", async () => {
    service.pipelineJobDurationSeconds.observe({ queue: "render" }, 3.5);
    const metrics = await service.getMetrics();
    expect(metrics).toContain("pipeline_job_duration_seconds");
    expect(metrics).toContain("pipeline_job_duration_seconds_sum");
  });

  // UT-26-03: gauge set/inc/dec
  it("sets and reads queue_depth gauge (UT-26-03)", async () => {
    service.queueDepth.set({ queue: "research" }, 7);
    const metrics = await service.getMetrics();
    expect(metrics).toMatch(/queue_depth.*7/);
  });

  // UT-26-04: /metrics returns text with expected metric names
  it("getMetrics() returns text containing all 10 metric families (UT-26-04)", async () => {
    const metrics = await service.getMetrics();
    const expected = [
      "pipeline_jobs_total",
      "pipeline_job_duration_seconds",
      "queue_depth",
      "external_api_duration_seconds",
      "external_api_errors_total",
      "cache_hits_total",
      "cache_misses_total",
      "api_cost_usd_total",
      "active_websocket_connections",
      "dlq_depth",
    ];
    for (const name of expected) {
      expect(metrics).toContain(name);
    }
  });
});

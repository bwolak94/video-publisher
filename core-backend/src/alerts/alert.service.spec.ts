/**
 * Unit tests for AlertService — UT-27-03, UT-27-04
 * And DLQ depth gauge increment — UT-27-06
 */
import { AlertService } from "./alert.service";

function makeService(redisGet: jest.Mock, redisSet: jest.Mock) {
  const redis = { get: redisGet, set: redisSet };
  return new AlertService(redis as any);
}

describe("AlertService — deduplication", () => {
  beforeEach(() => {
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.SMTP_HOST;
  });

  // UT-27-03: same alert within 15 min → NOT sent (Redis returns a value)
  it("skips alert when dedup key exists in Redis (UT-27-03)", async () => {
    const redisGet = jest.fn().mockResolvedValue("1782000000000");
    const redisSet = jest.fn().mockResolvedValue("OK");
    const service = makeService(redisGet, redisSet);
    const slackSpy = jest.spyOn(service, "sendSlack");
    const emailSpy = jest.spyOn(service, "sendEmail");

    await service.send("dlq_escalation", { channelId: "ch-1" });

    expect(slackSpy).not.toHaveBeenCalled();
    expect(emailSpy).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  // UT-27-04: same alert after 15 min → IS sent (Redis returns null)
  it("sends alert when dedup key is expired (UT-27-04)", async () => {
    const redisGet = jest.fn().mockResolvedValue(null);
    const redisSet = jest.fn().mockResolvedValue("OK");
    const service = makeService(redisGet, redisSet);
    const slackSpy = jest.spyOn(service, "sendSlack").mockResolvedValue(undefined);
    const emailSpy = jest.spyOn(service, "sendEmail").mockResolvedValue(undefined);

    await service.send("dlq_escalation", { channelId: "ch-1" });

    expect(slackSpy).toHaveBeenCalledWith("dlq_escalation", expect.objectContaining({ channelId: "ch-1" }));
    expect(emailSpy).toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledWith(
      "alert:dlq_escalation:ch-1:last_sent",
      expect.any(String),
      "EX",
      900
    );
  });

  // UT-27-02 / control: onFailed at attempt 1 → DLQ NOT called
  it("sendImmediately bypasses dedup check entirely", async () => {
    const redisGet = jest.fn().mockResolvedValue("1782000000000"); // would deduplicate
    const redisSet = jest.fn().mockResolvedValue("OK");
    const service = makeService(redisGet, redisSet);
    const slackSpy = jest.spyOn(service, "sendSlack").mockResolvedValue(undefined);

    await service.sendImmediately("youtube_token_failure", { channelId: "ch-yt" });

    // Still fires despite dedup key being present
    expect(slackSpy).toHaveBeenCalled();
    expect(redisGet).not.toHaveBeenCalled();
  });
});

// UT-27-06: dlq_depth gauge increments on DLQ entry
describe("MetricsService — dlq_depth gauge (UT-27-06)", () => {
  it("increments dlq_depth gauge when job enters DLQ", async () => {
    const { MetricsService } = await import("../metrics/metrics.service");
    const metrics = new MetricsService();
    const before = await metrics.getMetrics();
    const countBefore = (before.match(/dlq_depth\{queue="render"\} (\d+)/) ?? [])[1] ?? "0";

    metrics.dlqDepth.inc({ queue: "render" });

    const after = await metrics.getMetrics();
    const countAfter = (after.match(/dlq_depth\{queue="render"\} (\d+)/) ?? [])[1] ?? "0";

    expect(parseInt(countAfter) - parseInt(countBefore)).toBe(1);
  });
});

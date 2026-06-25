import { ResearchWorker, type ResearchJobPayload, type ResearchResult } from "./research.worker";
import { DeduplicationService } from "../../worker-mode/deduplication.service";

function makeJob(
  data: Partial<ResearchJobPayload> & { attemptsMade?: number } = {}
): any {
  return {
    id: "job-1",
    data: {
      jobId: "db-job-1",
      channelId: "ch-1",
      nicheProfileId: "tech",
      sources: [],
      deduplicationWindowHours: 48,
      minViralityScore: 0.65,
      ...data,
    },
    attemptsMade: data.attemptsMade ?? 0,
    updateProgress: jest.fn(),
  };
}

describe("ResearchWorker", () => {
  let worker: ResearchWorker;
  let mockQueue: { add: jest.Mock };
  let mockDlqAlert: { alert: jest.Mock };
  let mockDedup: { isDuplicate: jest.Mock; markSeen: jest.Mock };
  let mockRedis: object;

  beforeEach(() => {
    mockRedis = {};
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockDlqAlert = { alert: jest.fn().mockResolvedValue(undefined) };
    mockDedup = {
      isDuplicate: jest.fn().mockResolvedValue(false),
      markSeen: jest.fn().mockResolvedValue(undefined),
    };

    worker = new ResearchWorker(
      mockRedis,
      mockDlqAlert as any,
      mockQueue as any,
      mockDedup as unknown as DeduplicationService
    );
  });

  // UT-23-08
  it("skips and does NOT enqueue when viralityScore < threshold", async () => {
    jest.spyOn(worker as any, "callAiBackend").mockResolvedValue({
      topic: "Low viral topic",
      viralityScore: 0.3,
      summary: "boring",
      sourceUrls: [],
    } satisfies ResearchResult);

    const job = makeJob({ minViralityScore: 0.65 });
    await (worker as any).process(job);

    expect(mockQueue.add).not.toHaveBeenCalled();
    expect(mockDedup.markSeen).not.toHaveBeenCalled();
  });

  // UT-23-09
  it("marks dedup and enqueues asset-generation when viralityScore >= threshold", async () => {
    jest.spyOn(worker as any, "callAiBackend").mockResolvedValue({
      topic: "Hot viral topic",
      viralityScore: 0.85,
      summary: "very interesting",
      sourceUrls: ["https://example.com/article"],
    } satisfies ResearchResult);

    const job = makeJob({ minViralityScore: 0.65 });
    await (worker as any).process(job);

    expect(mockDedup.markSeen).toHaveBeenCalledWith("Hot viral topic", 48);
    expect(mockQueue.add).toHaveBeenCalledWith(
      "asset-generation",
      expect.objectContaining({ topic: "Hot viral topic", channelId: "ch-1" })
    );
  });

  it("skips when topic is a duplicate", async () => {
    jest.spyOn(worker as any, "callAiBackend").mockResolvedValue({
      topic: "Already seen",
      viralityScore: 0.9,
      summary: "seen before",
      sourceUrls: [],
    } satisfies ResearchResult);

    mockDedup.isDuplicate.mockResolvedValue(true);

    const job = makeJob();
    await (worker as any).process(job);

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  // UT-23-10
  it("calls DlqAlertService.alert after MAX_ATTEMPTS failures", async () => {
    const job = makeJob({ attemptsMade: 3 });
    const err = new Error("AI backend down");

    await (worker as any).onFailed(job, err);

    expect(mockDlqAlert.alert).toHaveBeenCalledWith("db-job-1", "research", err);
  });

  it("does NOT call DlqAlertService before MAX_ATTEMPTS", async () => {
    const job = makeJob({ attemptsMade: 1 });
    await (worker as any).onFailed(job, new Error("transient"));
    expect(mockDlqAlert.alert).not.toHaveBeenCalled();
  });
});

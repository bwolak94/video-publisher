/**
 * Unit tests for DlqService — UT-27-01, UT-27-02, UT-27-05, UT-27-06
 */
import { DlqService } from "./dlq.service";
import { REDIS_CLIENT } from "../redis/redis.module";
import { Test } from "@nestjs/testing";
import { Job } from "bullmq";

// Prevent actual BullMQ Queue from connecting
const mockQueueAdd = jest.fn().mockResolvedValue({ id: "dlq-job-1" });
const mockJobRemove = jest.fn().mockResolvedValue(undefined);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockQueueAdd,
    close: jest.fn().mockResolvedValue(undefined),
    getJobs: jest.fn().mockResolvedValue([]),
  })),
  Job: {
    fromId: jest.fn(),
  },
}));

describe("DlqService", () => {
  let dlq: DlqService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DlqService,
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();
    dlq = module.get(DlqService);
    dlq.onModuleInit();
  });

  // UT-27-01: onFailed after 3rd attempt → DLQ enqueue
  it("enqueues job data to failed-jobs queue (UT-27-01)", async () => {
    const jobData = { jobId: "j-1", projectId: "p-1" };
    const err = new Error("ElevenLabs 503");

    await dlq.enqueue("asset-generation", jobData, err, 3);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({
        sourceQueue: "asset-generation",
        errorMessage: "ElevenLabs 503",
        attemptsMade: 3,
        jobData,
      })
    );
  });

  // UT-27-05: retry removes from DLQ — retryJob removes the job
  it("removes job from DLQ on retryJob (UT-27-05)", async () => {
    const mockFromId = Job.fromId as jest.Mock;
    mockFromId.mockResolvedValue({ remove: mockJobRemove, id: "dlq-1" });

    await dlq.retryJob("dlq-1", "asset-generation", { jobId: "j-1" });

    expect(mockFromId).toHaveBeenCalledWith(expect.anything(), "dlq-1");
    expect(mockJobRemove).toHaveBeenCalled();
  });
});

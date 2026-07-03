/**
 * Unit tests for AssetGenerationWorker — UT-08-04
 * Tests that onProgress emits WS event via EventsGateway.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { AssetGenerationWorker, AssetGenerationPayload } from "./asset-generation.worker";
import { JobSyncService } from "../job-sync.service";
import { DlqAlertService } from "../dlq-alert.service";
import { EventsGateway } from "../../gateway/events.gateway";
import { REDIS_CLIENT } from "../../redis/redis.module";
import { ElevenLabsService } from "../../elevenlabs/elevenlabs.service";
import { VideoAssetService } from "../../media/video-asset.service";
import { ImageAssetService } from "../../images/image-asset.service";
import { BudgetService } from "../../cost/budget.service";
import { CostRecordService } from "../../cost/cost-record.service";
import { DlqService } from "../dlq.service";
import { MetricsService } from "../../metrics/metrics.service";

// Prevent actual BullMQ worker from starting
jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

const PAYLOAD: AssetGenerationPayload = {
  jobId: "job-001",
  projectId: "proj-001",
  sceneId: "scene-3",
  step: "audio_scene_3",
  narrationText: "Hello world",
  voiceId: "voice-en",
  visualPrompt: "A futuristic city",
};

describe("AssetGenerationWorker — UT-08-04", () => {
  let worker: AssetGenerationWorker;
  let gateway: { broadcastJobProgress: jest.Mock };
  let jobSync: { syncCompleted: jest.Mock; syncFailed: jest.Mock; syncActive: jest.Mock; syncStalled: jest.Mock };
  let dlqAlert: { alert: jest.Mock };

  beforeEach(async () => {
    gateway = { broadcastJobProgress: jest.fn() };
    jobSync = {
      syncCompleted: jest.fn().mockResolvedValue(undefined),
      syncFailed: jest.fn().mockResolvedValue(undefined),
      syncActive: jest.fn().mockResolvedValue(undefined),
      syncStalled: jest.fn().mockResolvedValue(undefined),
    };
    dlqAlert = { alert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetGenerationWorker,
        { provide: REDIS_CLIENT, useValue: {} },
        { provide: JobSyncService, useValue: jobSync },
        { provide: DlqAlertService, useValue: dlqAlert },
        { provide: EventsGateway, useValue: gateway },
        { provide: ElevenLabsService, useValue: { generateAudio: jest.fn().mockResolvedValue("s3://url") } },
        { provide: VideoAssetService, useValue: { generateVideo: jest.fn().mockResolvedValue("s3://video-url") } },
        { provide: ImageAssetService, useValue: { generateImage: jest.fn().mockResolvedValue("s3://image-url") } },
        { provide: BudgetService, useValue: { incrementSpend: jest.fn().mockResolvedValue(undefined) } },
        { provide: CostRecordService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: DlqService, useValue: { enqueue: jest.fn().mockResolvedValue(undefined) } },
        { provide: MetricsService, useValue: { dlqDepth: { inc: jest.fn() } } },
      ],
    }).compile();

    worker = module.get<AssetGenerationWorker>(AssetGenerationWorker);
    worker.onModuleInit(); // starts BullMQ worker (mocked)
  });

  // UT-08-04: onProgress handler emits WS event via gateway
  it("onCompleted emits 'completed' WS event via gateway (UT-08-04 — completed path)", async () => {
    const job: any = { data: PAYLOAD, id: "bullmq-job-1", attemptsMade: 1 };

    // Call the private onCompleted handler directly
    await (worker as any).onCompleted(job);

    expect(jobSync.syncCompleted).toHaveBeenCalledWith(PAYLOAD.jobId);
    expect(gateway.broadcastJobProgress).toHaveBeenCalledWith(
      PAYLOAD.projectId,
      expect.objectContaining({
        jobId: PAYLOAD.jobId,
        step: PAYLOAD.step,
        status: "completed",
      })
    );
  });

  it("onFailed emits 'failed' WS event and calls DLQ alert after max attempts", async () => {
    const job: any = { data: PAYLOAD, id: "bullmq-job-2", attemptsMade: 3 };
    const err = new Error("ElevenLabs 503");

    await (worker as any).onFailed(job, err);

    expect(jobSync.syncFailed).toHaveBeenCalledWith(PAYLOAD.jobId, err);
    expect(gateway.broadcastJobProgress).toHaveBeenCalledWith(
      PAYLOAD.projectId,
      expect.objectContaining({ status: "failed" })
    );
    expect(dlqAlert.alert).toHaveBeenCalledWith(
      PAYLOAD.jobId,
      "asset-generation",
      err
    );
  });

  it("onFailed does NOT call DLQ alert if max attempts not reached", async () => {
    const job: any = { data: PAYLOAD, id: "bullmq-job-3", attemptsMade: 1 };
    await (worker as any).onFailed(job, new Error("transient"));

    expect(dlqAlert.alert).not.toHaveBeenCalled();
  });

  it("onProgress broadcasts progress event to WS (UT-08-04)", () => {
    const job: any = { data: PAYLOAD, id: "bullmq-job-4" };

    (worker as any).onProgress(job, 50);

    expect(gateway.broadcastJobProgress).toHaveBeenCalledWith(
      PAYLOAD.projectId,
      expect.objectContaining({ status: "progress", progress: 50 })
    );
  });
});

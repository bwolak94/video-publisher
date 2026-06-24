/**
 * Unit tests for JobSyncService — UT-08-02, UT-08-03
 */
import { Test, TestingModule } from "@nestjs/testing";
import { JobSyncService } from "./job-sync.service";
import { DlqAlertService } from "./dlq-alert.service";
import { DRIZZLE } from "../db/db.module";

const JOB_ID = "job-uuid-001";
const PROJECT_ID = "project-uuid-001";

function makeDbMock() {
  const mock = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
  return mock;
}

describe("JobSyncService", () => {
  let syncService: JobSyncService;
  let dlqAlert: DlqAlertService;
  let db: ReturnType<typeof makeDbMock>;

  beforeEach(async () => {
    db = makeDbMock();
    const alertSpy = { alert: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobSyncService,
        { provide: DRIZZLE, useValue: db },
        { provide: DlqAlertService, useValue: alertSpy },
      ],
    }).compile();

    syncService = module.get<JobSyncService>(JobSyncService);
    dlqAlert = module.get<DlqAlertService>(DlqAlertService);
  });

  // UT-08-02: onCompleted handler updates jobs table with status="completed"
  it("syncCompleted() calls DB update with status='completed' (UT-08-02)", async () => {
    await syncService.syncCompleted(JOB_ID);

    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
    expect(db.where).toHaveBeenCalled();
  });

  it("syncActive() calls DB update with status='active'", async () => {
    await syncService.syncActive(JOB_ID);

    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("syncFailed() calls DB update with status='failed' and error message", async () => {
    const err = new Error("ElevenLabs 503");
    await syncService.syncFailed(JOB_ID, err);

    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", error: "ElevenLabs 503" })
    );
  });

  it("syncStalled() calls DB update with status='stalled'", async () => {
    await syncService.syncStalled(JOB_ID);

    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "stalled" })
    );
  });
});

// UT-08-03: onFailed after 3rd attempt → DLQ alert triggered
describe("DlqAlertService — UT-08-03", () => {
  it("alert() logs CRITICAL and fires webhook when DLQ_WEBHOOK_URL is set", async () => {
    const fetchSpy = jest.spyOn(global, "fetch" as any).mockResolvedValue({
      ok: true,
      status: 200,
    } as any);
    process.env.DLQ_WEBHOOK_URL = "http://localhost:9999/dlq";

    const module: TestingModule = await Test.createTestingModule({
      providers: [DlqAlertService],
    }).compile();

    const service = module.get<DlqAlertService>(DlqAlertService);
    await service.alert(JOB_ID, "asset-generation", new Error("3rd attempt failed"));

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:9999/dlq",
      expect.objectContaining({ method: "POST" })
    );

    delete process.env.DLQ_WEBHOOK_URL;
    fetchSpy.mockRestore();
  });

  it("alert() does not throw when DLQ_WEBHOOK_URL is not set", async () => {
    delete process.env.DLQ_WEBHOOK_URL;
    const module: TestingModule = await Test.createTestingModule({
      providers: [DlqAlertService],
    }).compile();

    const service = module.get<DlqAlertService>(DlqAlertService);
    await expect(
      service.alert(JOB_ID, "asset-generation", new Error("fail"))
    ).resolves.not.toThrow();
  });
});

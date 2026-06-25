import { WorkerModeService } from "./worker-mode.service";
import { NicheProfileService } from "./niche-profile.service";

describe("WorkerModeService", () => {
  let service: WorkerModeService;
  let mockQueue: { add: jest.Mock };
  let nicheProfiles: NicheProfileService;

  beforeEach(() => {
    mockQueue = { add: jest.fn().mockResolvedValue(undefined) };
    nicheProfiles = new NicheProfileService();
    service = new WorkerModeService(mockQueue as any, nicheProfiles);
  });

  afterEach(() => {
    delete process.env.WORKER_ENABLED;
  });

  // UT-23-06
  it("returns early without enqueuing when WORKER_ENABLED is not 'true'", async () => {
    process.env.WORKER_ENABLED = "false";
    await service.triggerCycle({ channelId: "ch-1" });
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  // UT-23-07
  it("enqueues a research job with correct payload when enabled", async () => {
    process.env.WORKER_ENABLED = "true";
    await service.triggerCycle({ channelId: "ch-1", nicheProfileId: "gaming" });
    expect(mockQueue.add).toHaveBeenCalledWith("research", expect.objectContaining({
      channelId: "ch-1",
      nicheProfileId: "gaming",
    }));
  });

  it("uses default 'tech' profile when nicheProfileId is omitted", async () => {
    process.env.WORKER_ENABLED = "true";
    await service.triggerCycle({ channelId: "ch-2" });
    expect(mockQueue.add).toHaveBeenCalledWith("research", expect.objectContaining({
      nicheProfileId: "tech",
    }));
  });
});

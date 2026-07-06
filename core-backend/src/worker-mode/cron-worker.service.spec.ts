import { CronWorkerService } from "./cron-worker.service";

jest.mock("cron", () => ({
  CronJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

describe("CronWorkerService", () => {
  let service: CronWorkerService;
  let mockWorkerMode: { triggerCycle: jest.Mock };
  let mockSchedulerRegistry: { addCronJob: jest.Mock };

  beforeEach(() => {
    mockWorkerMode = { triggerCycle: jest.fn().mockResolvedValue(undefined) };
    mockSchedulerRegistry = { addCronJob: jest.fn() };
    service = new CronWorkerService(
      mockWorkerMode as any,
      mockSchedulerRegistry as any
    );
  });

  it("registers a cron job on module init", () => {
    service.onModuleInit();
    expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledWith(
      "worker-mode-cycle",
      expect.any(Object)
    );
  });
});

import { CronWorkerService } from "./cron-worker.service";

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

  afterEach(() => {
    const job = mockSchedulerRegistry.addCronJob.mock.calls[0]?.[1];
    job?.stop();
  });

  it("registers a cron job on module init", () => {
    service.onModuleInit();
    expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledWith(
      "worker-mode-cycle",
      expect.any(Object)
    );
  });
});

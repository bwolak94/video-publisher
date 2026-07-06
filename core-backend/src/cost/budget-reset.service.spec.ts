import { BudgetResetService } from "./budget-reset.service";

jest.mock("cron", () => ({
  CronJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

describe("BudgetResetService", () => {
  let service: BudgetResetService;
  let mockDb: { update: jest.Mock; set: jest.Mock };
  let mockSchedulerRegistry: { addCronJob: jest.Mock };

  beforeEach(() => {
    mockDb = {
      update: jest.fn().mockReturnValue({ set: jest.fn().mockResolvedValue([]) }),
      set: jest.fn(),
    };
    mockSchedulerRegistry = { addCronJob: jest.fn() };
    service = new BudgetResetService(mockDb as any, mockSchedulerRegistry as any);
  });

  // IT-25-02: monthly reset CRON fires → spend reset to 0
  it("resetAllSpend calls DB update on youtube_channels", async () => {
    const mockSet = jest.fn().mockResolvedValue([]);
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
    const db = { update: mockUpdate };
    const s = new BudgetResetService(db as any, mockSchedulerRegistry as any);

    await s.resetAllSpend();

    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ currentMonthSpendUsd: expect.anything() })
    );
  });

  it("registers a cron job for monthly reset on module init", () => {
    service.onModuleInit();
    expect(mockSchedulerRegistry.addCronJob).toHaveBeenCalledWith(
      "budget-monthly-reset",
      expect.any(Object)
    );
  });
});

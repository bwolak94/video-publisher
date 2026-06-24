/**
 * Unit tests for QueueService — UT-07-03
 */
import { Test, TestingModule } from "@nestjs/testing";
import { QueueService } from "./queue.service";
import { REDIS_CLIENT } from "../redis/redis.module";

// Mock BullMQ Queue so no real Redis needed
const mockJobResult = { id: "job-1", name: "research" };
const mockAdd = jest.fn().mockResolvedValue(mockJobResult);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe("QueueService — UT-07-03", () => {
  let service: QueueService;

  beforeEach(async () => {
    mockAdd.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: REDIS_CLIENT, useValue: {} },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    service.onModuleInit();
  });

  it("add('research', payload) enqueues job via BullMQ mock", async () => {
    const payload = { topic: "AI trends", channelId: "chan-1" };
    const job = await service.add("research", payload);

    expect(mockAdd).toHaveBeenCalledWith("research", payload);
    expect(job).toEqual(mockJobResult);
  });

  it("add() with unknown queue name throws", async () => {
    await expect(service.add("nonexistent" as any, {})).rejects.toThrow(
      "Unknown queue: nonexistent"
    );
  });
});

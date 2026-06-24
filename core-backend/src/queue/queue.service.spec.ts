/**
 * Unit tests for QueueService — UT-07-03 (still applies), UT-08-01
 */
import { Test, TestingModule } from "@nestjs/testing";
import { QueueService } from "./queue.service";
import { REDIS_CLIENT } from "../redis/redis.module";

const mockJobResult = { id: "job-1", name: "research" };
const mockAdd = jest.fn().mockResolvedValue(mockJobResult);

jest.mock("bullmq", () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe("QueueService", () => {
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

  // UT-07-03 (retained) + UT-08-01: add() enqueues to BullMQ
  it("add('asset-generation', payload) enqueues job via BullMQ mock (UT-08-01)", async () => {
    const payload = { jobId: "j-1", projectId: "p-1", sceneId: "s-3", step: "audio_scene_3" };
    const job = await service.add("asset-generation", payload);

    expect(mockAdd).toHaveBeenCalledWith("asset-generation", payload);
    expect(job).toEqual(mockJobResult);
  });

  it("add('research', payload) enqueues to research queue", async () => {
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

  it("getAllQueues() returns 3 queues", () => {
    expect(service.getAllQueues()).toHaveLength(3);
  });
});

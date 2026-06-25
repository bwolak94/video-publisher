import { DeduplicationService } from "./deduplication.service";
import { createHash } from "crypto";

function sha256Hex(s: string) {
  return createHash("sha256").update(s.toLowerCase().trim()).digest("hex");
}

describe("DeduplicationService", () => {
  let service: DeduplicationService;
  let mockRedis: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    mockRedis = { get: jest.fn(), set: jest.fn() };
    service = new DeduplicationService(mockRedis);
  });

  // UT-23-03
  it("returns false for an unseen topic", async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await service.isDuplicate("Brand new topic");
    expect(result).toBe(false);
    expect(mockRedis.get).toHaveBeenCalledWith(
      `dedup:topics:${sha256Hex("Brand new topic")}`
    );
  });

  // UT-23-04
  it("returns true when Redis key exists", async () => {
    mockRedis.get.mockResolvedValue("1");
    const result = await service.isDuplicate("Already seen topic");
    expect(result).toBe(true);
  });

  // UT-23-05
  it("markSeen calls Redis SET with correct TTL", async () => {
    mockRedis.set.mockResolvedValue("OK");
    await service.markSeen("New topic", 48);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `dedup:topics:${sha256Hex("New topic")}`,
      "1",
      "EX",
      172800 // 48 * 3600
    );
  });
});

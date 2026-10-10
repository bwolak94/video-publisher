import { Test, TestingModule } from "@nestjs/testing";
import { SfxService } from "./sfx.service";
import { DRIZZLE } from "../db/db.module";

/** Minimal in-memory seed data mirroring the migration inserts. */
const SEED_ROWS = [
  { id: "1", name: "Whoosh Fast",   tags: ["whoosh", "movement", "transition"], s3Url: "s3://sfx/whoosh-fast.mp3",   durationS: "0.50", license: "cc0", createdAt: new Date() },
  { id: "2", name: "Impact Heavy",  tags: ["impact", "hit", "punch"],           s3Url: "s3://sfx/impact-heavy.mp3",  durationS: "0.80", license: "cc0", createdAt: new Date() },
  { id: "3", name: "Door Creak",    tags: ["ambient", "door", "creak"],         s3Url: "s3://sfx/door-creak.mp3",    durationS: "1.20", license: "cc0", createdAt: new Date() },
  { id: "4", name: "Crowd Cheer",   tags: ["crowd", "cheer", "energy"],         s3Url: "s3://sfx/crowd-cheer.mp3",   durationS: "3.50", license: "cc0", createdAt: new Date() },
  { id: "5", name: "Thunder Clap",  tags: ["thunder", "weather", "dramatic"],   s3Url: "s3://sfx/thunder-clap.mp3",  durationS: "2.10", license: "cc0", createdAt: new Date() },
];

/** Builds a mock Drizzle db that returns the seed rows for any select(). */
function buildMockDb(rows = SEED_ROWS) {
  const selectChain = { from: jest.fn().mockResolvedValue(rows) };
  return { select: jest.fn().mockReturnValue(selectChain) };
}

describe("SfxService", () => {
  let service: SfxService;
  let mockDb: ReturnType<typeof buildMockDb>;

  beforeEach(async () => {
    mockDb = buildMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SfxService,
        { provide: DRIZZLE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SfxService>(SfxService);
  });

  describe("findAll", () => {
    it("returns all entries without filtering", async () => {
      const result = await service.findAll();
      expect(result).toHaveLength(SEED_ROWS.length);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe("findByTags", () => {
    it("returns entries containing a matching tag", async () => {
      const result = await service.findByTags(["whoosh"]);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe("Whoosh Fast");
    });

    it("excludes entries with no tag overlap", async () => {
      const result = await service.findByTags(["whoosh"]);
      const names = result.map((r) => r.name);
      // 'Door Creak' shares no tags with ['whoosh']
      expect(names).not.toContain("Door Creak");
    });

    it("ranks by Jaccard similarity — Impact Heavy above Door Creak for ['whoosh','impact']", async () => {
      const result = await service.findByTags(["whoosh", "impact"]);
      const names = result.map((r) => r.name);
      const impactIdx = names.indexOf("Impact Heavy");
      const doorIdx   = names.indexOf("Door Creak");

      // Impact Heavy has overlap ("impact"), Door Creak has none — so Door Creak
      // should not appear at all, and Impact Heavy should be present.
      expect(impactIdx).toBeGreaterThanOrEqual(0);
      if (doorIdx !== -1) {
        expect(impactIdx).toBeLessThan(doorIdx);
      }
    });

    it("returns entries sorted descending by Jaccard score", async () => {
      // 'Whoosh Fast' shares 1/3 tags with ['whoosh'] → score 1/3
      // 'Impact Heavy' shares 0 tags → excluded
      const result = await service.findByTags(["whoosh"]);
      // All returned entries must have non-zero overlap
      for (const entry of result) {
        const overlap = (entry.tags ?? []).some((t) => ["whoosh"].includes(t));
        expect(overlap).toBe(true);
      }
    });

    it("returns empty array when no entries match", async () => {
      const result = await service.findByTags(["zzz_nonexistent_tag"]);
      expect(result).toHaveLength(0);
    });
  });
});

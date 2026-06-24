/**
 * Unit tests for ProjectsService — UT-07-01, UT-07-02
 */
import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { DRIZZLE } from "../db/db.module";

const EXISTING_USER_ID = "00000000-0000-0000-0000-000000000001";
const NONEXISTENT_USER_ID = "00000000-0000-0000-0000-000000000999";
const PROJECT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeDrizzleMock(userExists: boolean) {
  const mockProject = {
    id: PROJECT_ID,
    userId: EXISTING_USER_ID,
    title: "My Video",
    mode: "worker",
    status: "draft",
    storyboard: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(userExists ? [{ id: EXISTING_USER_ID }] : []),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([mockProject]),
  };
}

describe("ProjectsService", () => {
  let service: ProjectsService;
  let drizzleMock: ReturnType<typeof makeDrizzleMock>;

  async function buildService(userExists: boolean) {
    drizzleMock = makeDrizzleMock(userExists);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DRIZZLE, useValue: drizzleMock },
      ],
    }).compile();
    service = module.get<ProjectsService>(ProjectsService);
  }

  // UT-07-01: create() with valid payload returns project with UUID
  describe("create() — UT-07-01", () => {
    beforeEach(() => buildService(true));

    it("returns created project with generated UUID", async () => {
      const project = await service.create(EXISTING_USER_ID, {
        title: "My Video",
        mode: "worker",
      });

      expect(project.id).toBe(PROJECT_ID);
      expect(project.title).toBe("My Video");
      expect(project.mode).toBe("worker");
      expect(project.status).toBe("draft");
      expect(project.userId).toBe(EXISTING_USER_ID);
    });
  });

  // UT-07-02: create() for non-existent userId throws NotFoundException
  describe("create() — UT-07-02", () => {
    beforeEach(() => buildService(false));

    it("throws NotFoundException for unknown userId", async () => {
      await expect(
        service.create(NONEXISTENT_USER_ID, { title: "Test", mode: "worker" })
      ).rejects.toThrow(NotFoundException);
    });
  });
});

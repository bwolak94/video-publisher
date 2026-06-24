/**
 * Unit tests for EventsGateway — UT-15-01..08
 */
import { Test, TestingModule } from "@nestjs/testing";
import { EventsGateway } from "./events.gateway";
import { EventCacheService } from "./event-cache.service";
import { JwtService } from "@nestjs/jwt";
import { ProjectsService } from "../projects/projects.service";

function makeClient(overrides: Partial<any> = {}): any {
  return {
    handshake: { auth: {}, headers: {}, query: {} },
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
    userId: undefined,
    ...overrides,
  };
}

describe("EventsGateway", () => {
  let gateway: EventsGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let projectsService: { findOne: jest.Mock };
  let eventCache: { cacheEvent: jest.Mock; getCachedEvents: jest.Mock };
  let serverEmitMock: jest.Mock;

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    projectsService = { findOne: jest.fn() };
    eventCache = {
      cacheEvent: jest.fn().mockResolvedValue(undefined),
      getCachedEvents: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ProjectsService, useValue: projectsService },
        { provide: EventCacheService, useValue: eventCache },
      ],
    }).compile();

    gateway = module.get(EventsGateway);

    // Mock the Socket.io server
    serverEmitMock = jest.fn();
    (gateway as any).server = {
      to: jest.fn().mockReturnValue({ emit: serverEmitMock }),
    };
  });

  // UT-15-01: valid JWT → connection accepted, userId extracted
  it("accepts connection with valid JWT token (UT-15-01)", async () => {
    const client = makeClient({ handshake: { auth: { token: "valid.jwt.token" }, headers: {}, query: {} } });
    jwtService.verifyAsync.mockResolvedValue({ sub: "user-123" });

    await gateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.userId).toBe("user-123");
  });

  // UT-15-02: expired JWT → connection rejected
  it("rejects connection with expired JWT (UT-15-02)", async () => {
    const client = makeClient({ handshake: { auth: { token: "expired.token" }, headers: {}, query: {} } });
    jwtService.verifyAsync.mockRejectedValue(new Error("jwt expired"));

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: 4001 }));
  });

  it("rejects connection with no token (UT-15-02 variant)", async () => {
    const client = makeClient();
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  // UT-15-03: join-project with owned project → socket added to room
  it("adds socket to room when user owns project (UT-15-03)", async () => {
    const client = makeClient({ userId: "user-1" });
    projectsService.findOne.mockResolvedValue({ id: "proj-1", userId: "user-1" });

    await gateway.handleJoinProject(client, { projectId: "proj-1" });

    expect(client.join).toHaveBeenCalledWith("project:proj-1");
    expect(client.emit).not.toHaveBeenCalledWith("error", expect.anything());
  });

  // UT-15-04: join-project with unowned project → error emitted, NOT in room
  it("rejects join-project when user does not own project (UT-15-04)", async () => {
    const client = makeClient({ userId: "user-1" });
    projectsService.findOne.mockResolvedValue({ id: "proj-1", userId: "other-user" });

    await gateway.handleJoinProject(client, { projectId: "proj-1" });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith("error", expect.objectContaining({ message: "Unauthorized" }));
  });

  // UT-15-05: event emitted to room → server.to().emit() called
  it("emits event to project room via server (UT-15-05)", async () => {
    await gateway.broadcastJobProgress("proj-1", {
      jobId: "j1",
      step: "audio_scene_1",
      status: "completed",
    });

    expect((gateway as any).server.to).toHaveBeenCalledWith("project:proj-1");
    expect(serverEmitMock).toHaveBeenCalledWith("job.progress", expect.objectContaining({ step: "audio_scene_1" }));
  });

  // UT-15-06: last-event cache written on step_completed
  it("caches event in Redis on step_completed (UT-15-06)", async () => {
    await gateway.broadcastJobProgress("proj-1", {
      jobId: "j1",
      step: "audio_scene_2",
      status: "completed",
    });

    expect(eventCache.cacheEvent).toHaveBeenCalledWith(
      "proj-1",
      "audio_scene_2",
      expect.objectContaining({ step: "audio_scene_2", status: "completed" })
    );
  });

  it("does not cache progress events (only completed/failed)", async () => {
    await gateway.broadcastJobProgress("proj-1", {
      jobId: "j1",
      step: "render",
      status: "progress",
      progress: 50,
    });
    expect(eventCache.cacheEvent).not.toHaveBeenCalled();
  });

  // UT-15-07: reconnect → cached events emitted to socket
  it("emits cached events to socket on join-project (UT-15-07)", async () => {
    const client = makeClient({ userId: "user-1" });
    projectsService.findOne.mockResolvedValue({ id: "proj-1", userId: "user-1" });
    eventCache.getCachedEvents.mockResolvedValue([
      { step: "audio_scene_1", status: "completed", jobId: "j1" },
      { step: "audio_scene_2", status: "completed", jobId: "j2" },
    ]);

    await gateway.handleJoinProject(client, { projectId: "proj-1" });

    expect(client.emit).toHaveBeenCalledWith("job.progress", expect.objectContaining({ step: "audio_scene_1" }));
    expect(client.emit).toHaveBeenCalledWith("job.progress", expect.objectContaining({ step: "audio_scene_2" }));
  });

  // UT-15-08: rate limiting — 15 rapid events → only 10 emitted
  it("rate limits: drops events beyond 10 per second per project (UT-15-08)", async () => {
    const payload = { jobId: "j", step: "render", status: "progress", progress: 0 };

    for (let i = 0; i < 15; i++) {
      await gateway.broadcastJobProgress("proj-rate", { ...payload, progress: i });
    }

    expect(serverEmitMock).toHaveBeenCalledTimes(10);
  });
});

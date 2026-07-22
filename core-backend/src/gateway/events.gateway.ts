import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { Inject } from "@nestjs/common";
import { ProjectsService } from "../projects/projects.service";
import { EventCacheService } from "./event-cache.service";
import { RateLimiter } from "./rate-limiter";
import { WebhookService } from "../webhooks/webhook.service";
import { BudgetApprovalGate } from "../cost/budget-approval-gate";

// I10: A single socket may join at most this many project rooms.
// Prevents resource exhaustion on large accounts or from misbehaving clients.
const MAX_ROOMS_PER_SOCKET = 10;

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly rateLimiter = new RateLimiter();
  /** I10: tracks how many project rooms each socket has joined */
  private readonly socketRoomCount = new Map<string, number>();

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    private readonly projectsService: ProjectsService,
    private readonly eventCache: EventCacheService,
    private readonly webhookService: WebhookService,
    private readonly approvalGate: BudgetApprovalGate,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace("Bearer ", "");

    if (!token) {
      client.emit("error", { code: 4001, message: "Unauthorized" });
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      (client as any).userId = payload.sub;
    } catch {
      client.emit("error", { code: 4001, message: "Unauthorized" });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // I10: clean up room-count tracking so Map doesn't grow unbounded
    this.socketRoomCount.delete(client.id);
  }

  /**
   * Client joins a project room. Validates ownership before adding.
   * On success, emits all cached last-known events for reconnection support.
   */
  @SubscribeMessage("join-project")
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string }
  ) {
    const userId = (client as any).userId;
    if (!userId) {
      client.emit("error", { message: "Unauthorized" });
      return;
    }

    let project: any;
    try {
      project = await this.projectsService.findOne(data.projectId);
    } catch {
      client.emit("error", { message: "Project not found" });
      return;
    }

    if (project.userId !== userId) {
      client.emit("error", { message: "Unauthorized" });
      return;
    }

    // I10: Enforce per-socket room limit before joining
    const roomCount = this.socketRoomCount.get(client.id) ?? 0;
    if (roomCount >= MAX_ROOMS_PER_SOCKET) {
      client.emit("error", { message: `Room limit reached (max ${MAX_ROOMS_PER_SOCKET} projects per connection)` });
      return;
    }
    this.socketRoomCount.set(client.id, roomCount + 1);

    await client.join(`project:${data.projectId}`);

    // Emit cached events immediately for reconnection (Rule #5)
    const cached = await this.eventCache.getCachedEvents(data.projectId);
    for (const event of cached) {
      client.emit("job.progress", event);
    }

    return { event: "joined", projectId: data.projectId };
  }

  /**
   * Broadcast job progress to all sockets in the project room.
   * Applies rate limiting (max 10/sec per project) and caches completed/failed events.
   */
  broadcastUploadProgress(projectId: string, percent: number): void {
    this.server
      .to(`project:${projectId}`)
      .emit("upload_progress", { type: "upload_progress", percent, projectId });
  }

  /** Emit granular render progress (0-100) during Remotion Lambda render (IMPROVEMENT-6). */
  broadcastRenderProgress(projectId: string, percent: number): void {
    this.server
      .to(`project:${projectId}`)
      .emit("render_progress", { type: "render_progress", percent, projectId });
  }

  /** Push approval_required event to all sockets in the project room (FEATURE-09). */
  emitApprovalRequired(
    projectId: string,
    payload: { jobId: string; estimatedCost: number; provider: string; action: string; sceneId?: string },
  ): void {
    this.server
      .to(`project:${projectId}`)
      .emit("approval_required", { event: "approval_required", ...payload });
  }

  /** Broadcast a localization pipeline event to all sockets in a project room (FEATURE-10). */
  emitLocalizationEvent(
    projectId: string,
    event: "localization_complete" | "localization_failed",
    payload: Record<string, unknown>,
  ): void {
    this.server.to(`project:${projectId}`).emit(event, { event, ...payload });
  }

  /** Client approves a pending action (FEATURE-09). */
  @SubscribeMessage("approve_action")
  handleApproveAction(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    const resolved = this.approvalGate.approveJob(data?.jobId ?? "");
    return { event: "approval_ack", jobId: data?.jobId, resolved };
  }

  /** Client rejects a pending action (FEATURE-09). */
  @SubscribeMessage("reject_action")
  handleRejectAction(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    const resolved = this.approvalGate.rejectJob(data?.jobId ?? "");
    return { event: "rejection_ack", jobId: data?.jobId, resolved };
  }

  async broadcastJobProgress(
    projectId: string,
    payload: { jobId: string; step: string; status: string; [key: string]: any }
  ): Promise<void> {
    if (!this.rateLimiter.shouldAllow(projectId)) {
      return; // rate limit exceeded — event dropped
    }

    this.server.to(`project:${projectId}`).emit("job.progress", payload);

    if (payload.status === "completed" || payload.status === "failed") {
      await this.eventCache.cacheEvent(projectId, payload.step, payload);
      const event = payload.status === "completed" ? "job.completed" : "job.failed";
      this.webhookService.fanOut(event, { projectId, ...payload }).catch(() => {});
    }
  }
}

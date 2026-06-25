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

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly rateLimiter = new RateLimiter();

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    private readonly projectsService: ProjectsService,
    private readonly eventCache: EventCacheService
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

  handleDisconnect(_client: Socket) {
    // Socket.io handles room cleanup automatically on disconnect
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

    client.join(`project:${data.projectId}`);

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
    }
  }
}

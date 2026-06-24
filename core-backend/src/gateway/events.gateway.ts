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

@WebSocketGateway({ cors: true })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.headers?.authorization as string)?.replace("Bearer ", "");

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      (client as any).userId = payload.sub;
    } catch {
      // WS connections with invalid JWT are rejected with code 4001
      client.emit("error", { code: 4001, message: "Unauthorized" });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    // cleanup if needed
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string }
  ) {
    client.join(`project:${data.projectId}`);
    return { event: "subscribed", projectId: data.projectId };
  }

  broadcastJobProgress(
    projectId: string,
    payload: { jobId: string; step: string; status: string }
  ) {
    this.server.to(`project:${projectId}`).emit("job.progress", payload);
  }
}

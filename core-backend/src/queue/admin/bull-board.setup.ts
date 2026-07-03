import { INestApplication } from "@nestjs/common";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { createBullBoard } from "@bull-board/api";
import { QueueService } from "../queue.service";

/**
 * Mounts the Bull Board admin UI at /admin/queues.
 * Only called in development (NODE_ENV !== 'production').
 */
export function setupBullBoard(app: INestApplication): void {
  const queueService = app.get(QueueService);
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath("/admin/queues");

  createBullBoard({
    queues: queueService.getAllQueues().map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  // Register the Fastify plugin on the underlying Fastify instance
  const fastify = app.getHttpAdapter().getInstance();
  fastify.register(serverAdapter.registerPlugin(), {
    prefix: "/admin/queues",
    basePath: "/admin/queues",
  });
}

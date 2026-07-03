import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { DRIZZLE, runMigrations } from "./db/db.module";
import pino from "pino";

import { configuration } from "./config/configuration";

async function bootstrap() {
  const logger = pino({ level: "info" });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true }
  );

  // Structured per-request logging: requestId, userId, durationMs
  app.getHttpAdapter().getInstance().addHook("onRequest", (req: any, _reply: any, done: () => void) => {
    req.pinoStartTime = Date.now();
    done();
  });
  app.getHttpAdapter().getInstance().addHook("onResponse", (req: any, reply: any, done: () => void) => {
    logger.info({
      requestId: req.id,
      userId: (req as any).userId ?? null,
      method: req.method,
      url: req.url,
      statusCode: reply.statusCode,
      durationMs: Date.now() - req.pinoStartTime,
    }, "request completed");
    done();
  });

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });

  // BullBoard disabled: @bull-board/fastify requires @fastify/view 5.x but project uses Fastify 4.x
  // if (process.env.NODE_ENV !== "production") {
  //   setupBullBoard(app);
  // }

  // Run DB migrations on startup (UC-01)
  const db = app.get(DRIZZLE);
  await runMigrations(db);

  const config = configuration();
  await app.listen(config.port, "0.0.0.0");
  logger.info({ port: config.port }, "core-backend started");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

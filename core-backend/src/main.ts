import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import pino from "pino";
import { configuration } from "./config/configuration";

async function bootstrap() {
  const logger = pino({ level: "info" });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true }
  );

  const config = configuration();
  await app.listen(config.port, "0.0.0.0");
  logger.info({ port: config.port }, "core-backend started");
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

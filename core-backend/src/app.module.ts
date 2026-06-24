import { Module } from "@nestjs/common";
import { DbModule } from "./db/db.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { QueueModule } from "./queue/queue.module";
import { HealthModule } from "./health/health.module";
import { GatewayModule } from "./gateway/gateway.module";

@Module({
  imports: [
    DbModule,
    RedisModule,
    AuthModule,
    HealthModule,
    ProjectsModule,
    QueueModule,
    GatewayModule,
  ],
})
export class AppModule {}

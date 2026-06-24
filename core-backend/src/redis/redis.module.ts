import { Module, Global } from "@nestjs/common";
import Redis from "ioredis";
import { configuration } from "../config/configuration";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const config = configuration();
        return new Redis({
          host: config.redis.host,
          port: config.redis.port,
          lazyConnect: true,
          maxRetriesPerRequest: null,
        });
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

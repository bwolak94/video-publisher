import { Module } from "@nestjs/common";
import { ShortsController } from "./shorts.controller";
import { ShortsService, ANTHROPIC_HTTP } from "./shorts.service";
import { T2iService } from "./t2i.service";

@Module({
  controllers: [ShortsController],
  providers: [
    ShortsService,
    T2iService,
    {
      provide: ANTHROPIC_HTTP,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [ShortsService, T2iService],
})
export class ShortsModule {}

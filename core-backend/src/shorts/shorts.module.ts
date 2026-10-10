import { Module } from "@nestjs/common";
import { ShortsController } from "./shorts.controller";
import { ShortsService, ANTHROPIC_HTTP } from "./shorts.service";

@Module({
  controllers: [ShortsController],
  providers: [
    ShortsService,
    {
      provide: ANTHROPIC_HTTP,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [ShortsService],
})
export class ShortsModule {}

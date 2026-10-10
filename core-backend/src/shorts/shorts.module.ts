import { Module } from "@nestjs/common";
import { ShortsController } from "./shorts.controller";
import { ShortsService, ANTHROPIC_HTTP } from "./shorts.service";
import { T2iService } from "./t2i.service";
import { QaGateService, QA_GATE_HTTP } from "./qa-gate.service";
import { QaGateWorker } from "./qa-gate.worker";

@Module({
  controllers: [ShortsController],
  providers: [
    ShortsService,
    T2iService,
    QaGateService,
    QaGateWorker,
    {
      provide: ANTHROPIC_HTTP,
      useValue: fetch.bind(globalThis),
    },
    {
      provide: QA_GATE_HTTP,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [ShortsService, T2iService, QaGateService],
})
export class ShortsModule {}

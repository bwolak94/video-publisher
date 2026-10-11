import { Module } from "@nestjs/common";
import { ShortsController } from "./shorts.controller";
import { ShortsService, ANTHROPIC_HTTP } from "./shorts.service";
import { T2iService } from "./t2i.service";
import { QaGateService, QA_GATE_HTTP } from "./qa-gate.service";
import { QaGateWorker } from "./qa-gate.worker";
import { C2paService } from "./c2pa.service";
import { FinalizeService } from "./finalize.service";
import { LipsyncService } from "./lipsync.service";
import { V2VService } from "./v2v.service";
import { SourceClipsModule } from "../source-clips/source-clips.module";

@Module({
  imports: [SourceClipsModule],
  controllers: [ShortsController],
  providers: [
    ShortsService,
    T2iService,
    QaGateService,
    QaGateWorker,
    C2paService,
    FinalizeService,
    LipsyncService,
    V2VService,
    {
      provide: ANTHROPIC_HTTP,
      useValue: fetch.bind(globalThis),
    },
    {
      provide: QA_GATE_HTTP,
      useValue: fetch.bind(globalThis),
    },
  ],
  exports: [ShortsService, T2iService, QaGateService, C2paService, FinalizeService, LipsyncService, V2VService],
})
export class ShortsModule {}

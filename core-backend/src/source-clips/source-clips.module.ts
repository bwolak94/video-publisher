import { Module } from "@nestjs/common";
import { SourceClipsController } from "./source-clips.controller";
import { SourceClipsService } from "./source-clips.service";

@Module({
  controllers: [SourceClipsController],
  providers: [SourceClipsService],
  exports: [SourceClipsService],
})
export class SourceClipsModule {}

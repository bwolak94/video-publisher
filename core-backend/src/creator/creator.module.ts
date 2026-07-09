import { Module, forwardRef } from "@nestjs/common";
import { CreatorController } from "./creator.controller";
import { ProjectsModule } from "../projects/projects.module";
import { ClonedVoiceService } from "./cloned-voice.service";

@Module({
  imports: [forwardRef(() => ProjectsModule)],
  controllers: [CreatorController],
  providers: [ClonedVoiceService],
  exports: [ClonedVoiceService],
})
export class CreatorModule {}

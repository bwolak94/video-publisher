import { Module, forwardRef } from "@nestjs/common";
import { CreatorController } from "./creator.controller";
import { ProjectsModule } from "../projects/projects.module";

@Module({
  imports: [forwardRef(() => ProjectsModule)],
  controllers: [CreatorController],
})
export class CreatorModule {}

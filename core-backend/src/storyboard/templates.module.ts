import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TemplateLibraryService } from "./template-library.service";
import { TemplatesController } from "./templates.controller";

@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [TemplateLibraryService],
  exports: [TemplateLibraryService],
})
export class TemplatesModule {}

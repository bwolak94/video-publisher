import { Module } from "@nestjs/common";
import { TemplateLibraryService } from "./template-library.service";
import { TemplatesController } from "./templates.controller";

@Module({
  controllers: [TemplatesController],
  providers: [TemplateLibraryService],
  exports: [TemplateLibraryService],
})
export class TemplatesModule {}

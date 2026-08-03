import { Module } from "@nestjs/common";
import { RenderService } from "./render.service";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  providers: [RenderService],
  exports: [RenderService],
})
export class RenderModule {}

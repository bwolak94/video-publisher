import { Module } from "@nestjs/common";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";
import { QueueModule } from "../queue/queue.module";
import { ScenesModule } from "../scenes/scenes.module";

@Module({
  imports: [QueueModule, ScenesModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}

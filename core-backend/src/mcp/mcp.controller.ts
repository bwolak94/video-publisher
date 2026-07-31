import { Controller, Get, Post, Body } from "@nestjs/common";
import { McpService } from "./mcp.service";

@Controller("mcp")
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Get()
  getServerInfo() {
    return this.mcp.getServerInfo();
  }

  @Post()
  handleRequest(@Body() body: any) {
    return this.mcp.handleRequest(body);
  }
}

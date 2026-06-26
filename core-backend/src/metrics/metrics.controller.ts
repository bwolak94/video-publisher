import { Controller, Get, Res } from "@nestjs/common";
import { FastifyReply } from "fastify";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async get(@Res() res: FastifyReply) {
    res.header("Content-Type", this.metrics.contentType());
    res.send(await this.metrics.getMetrics());
  }
}

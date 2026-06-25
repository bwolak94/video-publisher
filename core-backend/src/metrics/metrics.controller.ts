import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { MetricsService } from "./metrics.service";

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async get(@Res() res: Response) {
    res.setHeader("Content-Type", this.metrics.contentType());
    res.end(await this.metrics.getMetrics());
  }
}

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { eq, desc } from "drizzle-orm";
import { WebhookService, type WebhookEvent } from "./webhook.service";
import { DRIZZLE } from "../db/db.module";
import { webhookDeliveryLog } from "../db/schema";
import { AuthGuard } from "../auth/auth.guard";

interface CreateWebhookBody {
  url: string;
  events: WebhookEvent[];
}

@UseGuards(AuthGuard)
@Controller("api/webhooks")
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhookService,
    @Inject(DRIZZLE) private readonly db: any,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: any, @Body() body: CreateWebhookBody) {
    // userId derived from JWT payload via AuthGuard
    return this.webhooks.create(req.userId as string, body.url, body.events);
  }

  @Get()
  async list(@Req() req: any) {
    // userId derived from JWT payload via AuthGuard
    return this.webhooks.list(req.userId as string);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: any, @Param("id") id: string) {
    // userId derived from JWT payload via AuthGuard
    await this.webhooks.delete(id, req.userId as string);
  }

  /** I8: List delivery log entries for a webhook (newest first, max 100). */
  @Get(":id/deliveries")
  async deliveries(@Param("id") id: string) {
    return this.db
      .select()
      .from(webhookDeliveryLog)
      .where(eq(webhookDeliveryLog.webhookId, id))
      .orderBy(desc(webhookDeliveryLog.attemptedAt))
      .limit(100);
  }
}

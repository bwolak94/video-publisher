import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { eq, desc } from "drizzle-orm";
import { WebhookService, type WebhookEvent } from "./webhook.service";
import { DRIZZLE } from "../db/db.module";
import { webhookDeliveryLog } from "../db/schema";

interface CreateWebhookBody {
  userId: string;
  url: string;
  events: WebhookEvent[];
}

@Controller("api/webhooks")
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhookService,
    @Inject(DRIZZLE) private readonly db: any,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateWebhookBody) {
    return this.webhooks.create(body.userId, body.url, body.events);
  }

  @Get()
  async list(@Query("userId") userId: string) {
    return this.webhooks.list(userId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @Query("userId") userId: string) {
    await this.webhooks.delete(id, userId);
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

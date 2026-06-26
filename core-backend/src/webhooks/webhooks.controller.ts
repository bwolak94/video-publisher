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
} from "@nestjs/common";
import { WebhookService, type WebhookEvent } from "./webhook.service";

interface CreateWebhookBody {
  userId: string;
  url: string;
  events: WebhookEvent[];
}

@Controller("api/webhooks")
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

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
}

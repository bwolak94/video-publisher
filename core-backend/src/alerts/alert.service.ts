import { Injectable, Inject } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import pino from "pino";
import { REDIS_CLIENT } from "../redis/redis.module";

const logger = pino({ level: "info" });

const DEDUP_TTL_SECONDS = 15 * 60; // 15 minutes

export interface AlertContext {
  channelId?: string;
  jobId?: string;
  projectId?: string;
  queueName?: string;
  errorMessage?: string;
  extra?: Record<string, unknown>;
}

@Injectable()
export class AlertService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Send alert with 15-minute deduplication per (type, channelId).
   */
  async send(type: string, ctx: AlertContext): Promise<void> {
    const dedupKey = this.dedupKey(type, ctx.channelId ?? "global");
    const lastSent = await this.redis.get(dedupKey);
    if (lastSent) {
      logger.info({ type, channelId: ctx.channelId }, "Alert deduplicated — skipping");
      return;
    }

    await this.dispatch(type, ctx);
    await this.redis.set(dedupKey, Date.now().toString(), "EX", DEDUP_TTL_SECONDS);
  }

  /**
   * Send alert immediately — no deduplication (e.g. YouTube token failure).
   */
  async sendImmediately(type: string, ctx: AlertContext): Promise<void> {
    await this.dispatch(type, ctx);
  }

  private async dispatch(type: string, ctx: AlertContext): Promise<void> {
    await Promise.all([
      this.sendSlack(type, ctx),
      this.sendEmail(type, ctx),
    ]);
  }

  async sendSlack(type: string, ctx: AlertContext): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) return;

    const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000/dashboard/dlq";
    const errorSnippet = ctx.errorMessage
      ? `\n>Error: ${ctx.errorMessage.slice(0, 500)}`
      : "";
    const text =
      `*[${type.toUpperCase()}]* Alert fired\n` +
      `JobId: ${ctx.jobId ?? "n/a"} | Queue: ${ctx.queueName ?? "n/a"} | Project: ${ctx.projectId ?? "n/a"}` +
      errorSnippet +
      `\n<${dashboardUrl}|View DLQ Dashboard>`;

    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      logger.info({ type, channelId: ctx.channelId }, "Slack alert sent");
    } catch (err) {
      logger.error({ type, err }, "Slack alert delivery failed");
    }
  }

  async sendEmail(type: string, ctx: AlertContext): Promise<void> {
    const host = process.env.SMTP_HOST;
    if (!host) return;

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const to = process.env.ALERT_EMAIL_TO ?? "";
    if (!to) return;

    const subject = `[AI Video Factory] Alert: ${type}`;
    const body = this.buildEmailBody(type, ctx);

    const trySend = async () => {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? "alerts@ai-video-factory.app",
        to,
        subject,
        text: body,
      });
    };

    try {
      await trySend();
      logger.info({ type, to }, "Alert email sent");
    } catch (err) {
      logger.error({ type, err }, "Alert email failed — retrying once");
      try {
        await trySend();
      } catch (retryErr) {
        logger.error({ type, retryErr }, "Alert email retry failed — giving up");
      }
    }
  }

  private buildEmailBody(type: string, ctx: AlertContext): string {
    const dashboardUrl = process.env.DASHBOARD_URL ?? "http://localhost:3000/dashboard/dlq";
    if (type === "youtube_token_failure") {
      return (
        `Your YouTube channel connection has expired.\n\n` +
        `Channel ID: ${ctx.channelId ?? "unknown"}\n\n` +
        `Please reconnect at: ${dashboardUrl}\n`
      );
    }
    return (
      `Alert type: ${type}\n` +
      `Job ID: ${ctx.jobId ?? "n/a"}\n` +
      `Queue: ${ctx.queueName ?? "n/a"}\n` +
      `Project: ${ctx.projectId ?? "n/a"}\n` +
      `Error: ${ctx.errorMessage ?? "n/a"}\n\n` +
      `View DLQ: ${dashboardUrl}\n`
    );
  }

  private dedupKey(type: string, channelId: string): string {
    return `alert:${type}:${channelId}:last_sent`;
  }
}

/**
 * S2: Remotion Lambda webhook receiver.
 *
 * Lambda calls POST /webhooks/remotion when a render finishes (success/error/timeout).
 * The endpoint verifies the HMAC-SHA512 signature, then updates job status and
 * broadcasts the WebSocket event that the frontend is waiting for.
 *
 * This endpoint intentionally skips Keycloak JWT auth — Lambda has no tenant token.
 * Security is provided by HMAC-SHA512 verification of REMOTION_WEBHOOK_SECRET.
 * ADR: render-webhook bypasses JWT per security.md §auth exception for server callbacks.
 */
import { Controller, Post, Body, Headers, Req, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import pino from "pino";
import { JobSyncService } from "./job-sync.service";
import { EventsGateway } from "../gateway/events.gateway";
import { RenderQualityService } from "../render/render-quality.service";
import { QualityGatesService } from "../quality/quality-gates.service";

const logger = pino({ level: "info" });

interface RemoionWebhookSuccess {
  type: "success";
  renderId: string;
  bucketName: string;
  outputKey: string;
  outputUrl: string;
  customData: { projectId: string; jobId: string };
}

interface RemoionWebhookFailure {
  type: "error" | "timeout";
  renderId: string;
  errors?: Array<{ message: string }>;
  customData: { projectId: string; jobId: string };
}

type RemoionWebhook = RemoionWebhookSuccess | RemoionWebhookFailure;

@Controller("webhooks")
export class RenderWebhookController {
  constructor(
    private readonly jobSync: JobSyncService,
    private readonly gateway: EventsGateway,
    private readonly renderQuality: RenderQualityService,
    private readonly qualityGates: QualityGatesService,
  ) {}

  @Post("remotion")
  async handleRemotion(
    @Body() body: RemoionWebhook,
    @Headers("x-remotion-signature") signature: string,
    @Req() req: { rawBody?: Buffer },
  ): Promise<{ ok: true }> {
    this.verifySignature(signature, req.rawBody ?? Buffer.from(JSON.stringify(body)));

    const { projectId, jobId } = body.customData ?? {};
    if (!projectId || !jobId) {
      logger.warn({ body }, "Remotion webhook missing customData — ignoring");
      return { ok: true };
    }

    if (body.type === "success") {
      const s3Url = `s3://${body.bucketName}/${body.outputKey}`;
      logger.info({ projectId, jobId, renderId: body.renderId, s3Url }, "Render completed via webhook");

      await this.jobSync.syncCompleted(jobId);
      void this.gateway.broadcastRenderProgress(projectId, 100);
      void this.gateway.broadcastJobProgress(projectId, { jobId, status: "completed" } as any);

      this.qualityGates
        .analyzeAndSave(projectId, s3Url)
        .catch((err) => logger.warn({ err, projectId }, "Post-render quality analysis failed"));

      this.renderQuality
        .probe(projectId, s3Url)
        .catch((err) => logger.warn({ err, projectId }, "Render quality probe failed"));
    } else {
      const errMsg = (body as RemoionWebhookFailure).errors?.map((e) => e.message).join("; ") ?? body.type;
      logger.error({ projectId, jobId, renderId: body.renderId, type: body.type, errMsg }, "Render failed via webhook");

      await this.jobSync.syncFailed(jobId, new Error(errMsg));
      void this.gateway.broadcastJobProgress(projectId, { jobId, status: "failed" } as any);
    }

    return { ok: true };
  }

  private verifySignature(signature: string, rawBody: Buffer): void {
    const secret = process.env.REMOTION_WEBHOOK_SECRET;
    if (!secret) return; // dev mode — skip verification
    if (!signature) throw new UnauthorizedException("Missing X-Remotion-Signature header");

    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException("Invalid Remotion webhook signature");
    }
  }
}

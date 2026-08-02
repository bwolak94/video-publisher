import { Injectable } from "@nestjs/common";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { SettingsService } from "../settings/settings.service";
import { VideoStoryboard, StoryboardScene } from "../storyboard/video-storyboard";
import { NonS3UrlError } from "../storyboard/predownload-errors";
import {
  COMPOSITION_ID,
  FPS,
  MEMORY_MB,
  calculateDurationInFrames,
  getFramesPerLambda,
  getCompositionWidth,
  getCompositionHeight,
} from "../remotion/render-utils";

const logger = pino({ level: "info" });
const PRESIGN_TTL_SECONDS = 7200; // 2h — covers 30-min render + buffer

interface RenderConfig {
  functionName: string;
  serveUrl: string;
  region: string;
  webhookUrl: string | undefined;
  webhookSecret: string | undefined;
}

@Injectable()
export class RenderService {
  private readonly bucket: string;

  constructor(
    private readonly s3: S3Service,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
  }

  /**
   * Resolve Remotion config — env vars take priority, DB settings are the fallback.
   * This allows operators to set values in Settings UI without redeploying.
   */
  private async getRenderConfig(): Promise<RenderConfig> {
    const db = await this.settings.getAll();
    return {
      functionName: process.env.REMOTION_FUNCTION_NAME || db.remotion.functionName,
      serveUrl: process.env.REMOTION_SERVE_URL || db.remotion.serveUrl,
      region: process.env.AWS_REGION || db.remotion.region || "eu-central-1",
      webhookUrl: process.env.REMOTION_WEBHOOK_URL || db.remotion.webhookUrl || undefined,
      webhookSecret: process.env.REMOTION_WEBHOOK_SECRET
        || (db.remotion.webhookSecret ? await this.settings.getPlaintext("remotion.webhookSecret") ?? undefined : undefined),
    };
  }

  /**
   * Render a storyboard via Remotion Lambda and WAIT for completion (legacy polling mode).
   * Returns the final s3:// URL of the rendered mp4.
   */
  async render(storyboard: VideoStoryboard, projectId: string): Promise<string> {
    const cfg = await this.getRenderConfig();
    this.assertAllS3(storyboard);
    const preparedStoryboard = await this.prepareUrls(storyboard);
    const totalFrames = calculateDurationInFrames(preparedStoryboard.timeline, FPS);
    const framesPerLambda = getFramesPerLambda(totalFrames, FPS);
    const outName = `renders/${projectId}/${Date.now()}.mp4`;
    const aspectRatio = preparedStoryboard.meta.aspectRatio ?? "16:9";
    const width = getCompositionWidth(aspectRatio);
    const height = getCompositionHeight(aspectRatio);

    logger.info({ projectId, totalFrames, framesPerLambda, outName, width, height, aspectRatio }, "Dispatching render to Lambda (sync)");
    await this.callRenderMedia({
      region: cfg.region, functionName: cfg.functionName, serveUrl: cfg.serveUrl,
      composition: COMPOSITION_ID, inputProps: { storyboard: preparedStoryboard },
      codec: "h264", outName, framesPerLambda, architecture: "arm64",
      memorySizeInMb: MEMORY_MB, overwrite: true, width, height,
    });

    const s3Url = `s3://${this.bucket}/${outName}`;
    logger.info({ projectId, s3Url }, "Render completed");
    return s3Url;
  }

  /**
   * S2: Dispatch render to Lambda WITHOUT waiting. Returns the expected s3:// URL and renderId.
   * Completion is signalled via the Remotion webhook → /webhooks/remotion.
   */
  async renderAsync(storyboard: VideoStoryboard, projectId: string, jobId: string): Promise<{ s3Url: string; renderId: string }> {
    const cfg = await this.getRenderConfig();
    this.assertAllS3(storyboard);
    const preparedStoryboard = await this.prepareUrls(storyboard);
    const totalFrames = calculateDurationInFrames(preparedStoryboard.timeline, FPS);
    const framesPerLambda = getFramesPerLambda(totalFrames, FPS);
    const outName = `renders/${projectId}/${Date.now()}.mp4`;
    const aspectRatio = preparedStoryboard.meta.aspectRatio ?? "16:9";
    const width = getCompositionWidth(aspectRatio);
    const height = getCompositionHeight(aspectRatio);

    logger.info({ projectId, totalFrames, outName, width, height }, "Dispatching render to Lambda (async+webhook)");

    const { renderId } = await this.dispatchRenderAsync({
      region: cfg.region, functionName: cfg.functionName, serveUrl: cfg.serveUrl,
      composition: COMPOSITION_ID, inputProps: { storyboard: preparedStoryboard },
      codec: "h264", outName, framesPerLambda, architecture: "arm64",
      memorySizeInMb: MEMORY_MB, overwrite: true, width, height,
      ...(cfg.webhookUrl && cfg.webhookSecret
        ? { webhook: { url: cfg.webhookUrl, secret: cfg.webhookSecret, customData: { projectId, jobId } } }
        : {}),
    });

    const s3Url = `s3://${this.bucket}/${outName}`;
    logger.info({ projectId, renderId, s3Url }, "Render dispatched — awaiting Lambda webhook callback");
    return { s3Url, renderId };
  }

  private assertAllS3(storyboard: VideoStoryboard): void {
    for (const scene of storyboard.timeline) {
      if (scene.audioUrl && !scene.audioUrl.startsWith("s3://")) {
        throw new NonS3UrlError(
          `audioUrl in scene ${scene.sceneId} is not an S3 URL: ${scene.audioUrl}`
        );
      }
      if (scene.videoUrl && !scene.videoUrl.startsWith("s3://")) {
        throw new NonS3UrlError(
          `videoUrl in scene ${scene.sceneId} is not an S3 URL: ${scene.videoUrl}`
        );
      }
    }
  }

  private async prepareUrls(storyboard: VideoStoryboard): Promise<VideoStoryboard> {
    const timeline = await Promise.all(
      storyboard.timeline.map(async (scene): Promise<StoryboardScene> => ({
        ...scene,
        audioUrl: scene.audioUrl
          ? await this.s3.getPresignedUrl(this.s3UriToPath(scene.audioUrl), PRESIGN_TTL_SECONDS)
          : undefined,
        videoUrl: scene.videoUrl
          ? await this.s3.getPresignedUrl(this.s3UriToPath(scene.videoUrl), PRESIGN_TTL_SECONDS)
          : undefined,
      }))
    );
    return { ...storyboard, timeline };
  }

  private s3UriToPath(s3Uri: string): string {
    // s3://bucket-name/path/to/key → path/to/key
    return s3Uri.replace(/^s3:\/\/[^/]+\//, "");
  }

  protected async callRenderMedia(params: object): Promise<void> {
    const { renderMediaOnLambda } = await import("@remotion/lambda/client");
    await renderMediaOnLambda(params as any);
  }

  protected async dispatchRenderAsync(params: object): Promise<{ renderId: string }> {
    const { renderMediaOnLambda } = await import("@remotion/lambda/client");
    return renderMediaOnLambda(params as any) as Promise<{ renderId: string }>;
  }
}

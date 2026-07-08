import { Injectable } from "@nestjs/common";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { VideoStoryboard, StoryboardScene } from "../storyboard/video-storyboard";
import { NonS3UrlError } from "../storyboard/predownload-errors";
import {
  COMPOSITION_ID,
  FPS,
  LAMBDA_REGION,
  MEMORY_MB,
  calculateDurationInFrames,
  getFramesPerLambda,
  getCompositionWidth,
  getCompositionHeight,
} from "../remotion/render-utils";

const logger = pino({ level: "info" });
const PRESIGN_TTL_SECONDS = 7200; // 2h — covers 30-min render + buffer

@Injectable()
export class RenderService {
  private readonly functionName: string;
  private readonly serveUrl: string;
  private readonly bucket: string;

  constructor(private readonly s3: S3Service) {
    this.functionName = process.env.REMOTION_FUNCTION_NAME ?? "";
    this.serveUrl = process.env.REMOTION_SERVE_URL ?? "";
    this.bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET ?? "video-publisher-assets";
  }

  /**
   * Render a fully-populated storyboard (all s3:// URLs) via Remotion Lambda.
   * Returns the final s3:// URL of the rendered mp4.
   */
  async render(storyboard: VideoStoryboard, projectId: string): Promise<string> {
    // Guard: no external URLs may reach Remotion Lambda (PRD NFR-6.3.5)
    this.assertAllS3(storyboard);

    // Convert s3:// URIs to pre-signed HTTPS URLs for Lambda (Chrome can't handle s3://)
    const preparedStoryboard = await this.prepareUrls(storyboard);

    const totalFrames = calculateDurationInFrames(preparedStoryboard.timeline, FPS);
    const framesPerLambda = getFramesPerLambda(totalFrames, FPS);
    const outName = `renders/${projectId}/${Date.now()}.mp4`;
    const aspectRatio = preparedStoryboard.meta.aspectRatio ?? "16:9";
    const width = getCompositionWidth(aspectRatio);
    const height = getCompositionHeight(aspectRatio);

    logger.info(
      { projectId, totalFrames, framesPerLambda, outName, width, height, aspectRatio },
      "Dispatching render to Lambda"
    );

    await this.callRenderMedia({
      region: LAMBDA_REGION,
      functionName: this.functionName,
      serveUrl: this.serveUrl,
      composition: COMPOSITION_ID,
      inputProps: { storyboard: preparedStoryboard },
      codec: "h264",
      outName,
      framesPerLambda,
      architecture: "arm64",
      memorySizeInMb: MEMORY_MB,
      overwrite: true,
      width,
      height,
    });

    const s3Url = `s3://${this.bucket}/${outName}`;
    logger.info({ projectId, s3Url }, "Render completed");
    return s3Url;
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
}

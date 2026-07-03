/**
 * PreRenderValidatorService — FEATURE-07 Quality Gates.
 *
 * Validates all scene assets in a storyboard before dispatching a render job.
 * Runs async (network calls) but is designed to fail fast with clear error
 * messages that land in the DLQ via the existing render.worker.ts mechanism.
 *
 * Checks (in order):
 *   1. [sync]  videoUrl / audioUrl presence and s3:// scheme
 *   2. [sync]  non-empty timeline
 *   3. [async] zero-byte / missing file (S3 HeadObject ContentLength)
 *   4. [async] valid codec + format + duration (FFprobe via Python ai-backend)
 *
 * Checks 3 and 4 degrade gracefully: if S3 or the Python service is
 * unreachable the error is logged as a warning and validation passes so the
 * render is not blocked by infrastructure failures.
 */
import { Injectable } from "@nestjs/common";
import pino from "pino";
import { configuration } from "../config/configuration";
import { S3Service } from "../storage/s3.service";
import type { VideoStoryboard, StoryboardScene } from "../storyboard/video-storyboard";
import type { ValidationError, ValidationReport } from "./quality-gates.types";

const logger = pino({ level: "info" });

/** Strip "s3://bucket/" prefix to get the S3 key. */
function s3Key(url: string): string {
  return url.replace(/^s3:\/\/[^/]+\//, "");
}

@Injectable()
export class PreRenderValidatorService {
  private readonly aiBackendUrl: string;

  constructor(private readonly s3: S3Service) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

  async validate(storyboard: VideoStoryboard): Promise<ValidationReport> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // ── 1 & 2. Synchronous URL-format checks ─────────────────────────────
    const validScenes: StoryboardScene[] = [];

    for (const scene of storyboard.timeline) {
      const id = scene.sceneId;
      let sceneOk = true;

      if (!scene.videoUrl) {
        errors.push({ sceneId: id, field: "videoUrl", message: `Scene ${id}: missing videoUrl`, severity: "error" });
        sceneOk = false;
      } else if (!scene.videoUrl.startsWith("s3://")) {
        errors.push({
          sceneId: id,
          field: "videoUrl",
          message: `Scene ${id}: videoUrl is not an s3:// URL — got "${scene.videoUrl.slice(0, 40)}"`,
          severity: "error",
        });
        sceneOk = false;
      }

      if (!scene.audioUrl) {
        errors.push({ sceneId: id, field: "audioUrl", message: `Scene ${id}: missing audioUrl`, severity: "error" });
        sceneOk = false;
      } else if (!scene.audioUrl.startsWith("s3://")) {
        errors.push({
          sceneId: id,
          field: "audioUrl",
          message: `Scene ${id}: audioUrl is not an s3:// URL — got "${scene.audioUrl.slice(0, 40)}"`,
          severity: "error",
        });
        sceneOk = false;
      }

      if (sceneOk) validScenes.push(scene);
    }

    if (storyboard.timeline.length === 0) {
      errors.push({ field: "integrity", message: "Storyboard has no scenes", severity: "error" });
    }

    // ── 3. Zero-byte check (S3 HeadObject) ───────────────────────────────
    if (validScenes.length > 0) {
      const sizeErrors = await this.checkAssetSizes(validScenes);
      errors.push(...sizeErrors);

      // Only FFprobe scenes whose assets passed the size check
      const sizeFailedSceneIds = new Set(sizeErrors.map((e) => e.sceneId));
      const ffprobeScenes = validScenes.filter((s) => !sizeFailedSceneIds.has(s.sceneId));

      // ── 4. FFprobe format + duration check (via Python) ────────────────
      if (ffprobeScenes.length > 0) {
        const ffprobeErrors = await this.validateAssetsViaFFprobe(ffprobeScenes);
        errors.push(...ffprobeErrors);
      }
    }

    const passed = errors.filter((e) => e.severity === "error").length === 0;

    if (passed) {
      logger.info({ sceneCount: storyboard.timeline.length }, "Pre-render validation passed");
    } else {
      logger.warn({ errorCount: errors.length, errors: errors.map((e) => e.message) }, "Pre-render validation failed");
    }

    return { passed, errors, warnings, checkedAt: new Date().toISOString() };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async checkAssetSizes(scenes: StoryboardScene[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    await Promise.all(
      scenes.flatMap((scene) => [
        this.checkOneSize(scene.sceneId, "videoUrl", scene.videoUrl!).then((e) => e && errors.push(e)),
        this.checkOneSize(scene.sceneId, "audioUrl", scene.audioUrl!).then((e) => e && errors.push(e)),
      ]),
    );

    return errors;
  }

  private async checkOneSize(
    sceneId: string,
    field: "videoUrl" | "audioUrl",
    url: string,
  ): Promise<ValidationError | null> {
    try {
      const size = await this.s3.getObjectSize(s3Key(url));
      if (size === 0) {
        return {
          sceneId,
          field,
          message: `Scene ${sceneId}: ${field} is a zero-byte file (corrupted or incomplete upload)`,
          severity: "error",
        };
      }
      return null;
    } catch (err) {
      logger.warn({ err, sceneId, field }, "S3 HeadObject failed — skipping zero-byte check for this asset");
      return null; // degrade gracefully
    }
  }

  private async validateAssetsViaFFprobe(scenes: StoryboardScene[]): Promise<ValidationError[]> {
    // Build presigned URLs for all assets in parallel
    const presignPairs = await Promise.all(
      scenes.map(async (scene) => {
        const [videoUrl, audioUrl] = await Promise.all([
          this.s3.getPresignedUrl(s3Key(scene.videoUrl!), 300).catch(() => null),
          this.s3.getPresignedUrl(s3Key(scene.audioUrl!), 300).catch(() => null),
        ]);
        return { scene, videoUrl, audioUrl };
      }),
    );

    const assets: object[] = [];
    for (const { scene, videoUrl, audioUrl } of presignPairs) {
      if (videoUrl) {
        assets.push({
          sceneId: scene.sceneId,
          assetUrl: videoUrl,
          assetType: "video",
          expectedMinDurationSeconds: scene.durationInSeconds ?? null,
        });
      }
      if (audioUrl) {
        assets.push({
          sceneId: scene.sceneId,
          assetUrl: audioUrl,
          assetType: "audio",
        });
      }
    }

    if (assets.length === 0) return [];

    let report: { allValid: boolean; results: Array<{ sceneId: string; assetType: string; valid: boolean; error: string | null }> };
    try {
      const res = await fetch(`${this.aiBackendUrl}/api/quality/validate-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets }),
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, "FFprobe asset validation HTTP error — skipping format checks");
        return [];
      }

      report = await res.json() as typeof report;
    } catch (err) {
      logger.warn({ err }, "FFprobe asset validation request failed — skipping format checks");
      return [];
    }

    const errors: ValidationError[] = [];
    for (const result of report.results) {
      if (!result.valid && result.error) {
        const field: ValidationError["field"] =
          result.error.includes("narration") || result.error.includes("duration")
            ? "duration"
            : result.error.includes("codec") || result.error.includes("container") || result.error.includes("stream")
              ? "format"
              : result.assetType === "video" ? "videoUrl" : "audioUrl";

        errors.push({
          sceneId: result.sceneId,
          field,
          message: `Scene ${result.sceneId}: ${result.error}`,
          severity: "error",
        });
      }
    }
    return errors;
  }
}

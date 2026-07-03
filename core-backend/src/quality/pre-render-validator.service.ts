/**
 * PreRenderValidatorService — FEATURE-07 Quality Gates.
 *
 * Validates all scene assets in a storyboard before dispatching a render job.
 * Runs synchronously in the render worker so bad assets fail fast with a clear
 * error message that lands in the DLQ (via existing render.worker.ts mechanism).
 *
 * Checks performed per scene:
 *   1. videoUrl is present
 *   2. videoUrl starts with s3://
 *   3. audioUrl is present
 *   4. audioUrl starts with s3://
 *
 * S3 existence check (HeadObject) is intentionally skipped here — the Remotion
 * Lambda pre-signs and validates each URL before rendering, which is the
 * authoritative existence check. Adding HeadObject here would double the cost
 * and latency for large storyboards (N*2 extra network calls).
 */
import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { VideoStoryboard } from "../storyboard/video-storyboard";
import type { ValidationError, ValidationReport } from "./quality-gates.types";

const logger = pino({ level: "info" });

@Injectable()
export class PreRenderValidatorService {
  /**
   * Validate all scene assets. Returns a ValidationReport.
   * Callers should throw if `report.passed === false`.
   */
  validate(storyboard: VideoStoryboard): ValidationReport {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    for (const scene of storyboard.timeline) {
      const id = scene.sceneId;

      // ── videoUrl checks ──────────────────────────────────────────────────
      if (!scene.videoUrl) {
        errors.push({
          sceneId: id,
          field: "videoUrl",
          message: `Scene ${id}: missing videoUrl`,
          severity: "error",
        });
      } else if (!scene.videoUrl.startsWith("s3://")) {
        errors.push({
          sceneId: id,
          field: "videoUrl",
          message: `Scene ${id}: videoUrl is not an s3:// URL — got "${scene.videoUrl.slice(0, 40)}"`,
          severity: "error",
        });
      }

      // ── audioUrl checks ──────────────────────────────────────────────────
      if (!scene.audioUrl) {
        errors.push({
          sceneId: id,
          field: "audioUrl",
          message: `Scene ${id}: missing audioUrl`,
          severity: "error",
        });
      } else if (!scene.audioUrl.startsWith("s3://")) {
        errors.push({
          sceneId: id,
          field: "audioUrl",
          message: `Scene ${id}: audioUrl is not an s3:// URL — got "${scene.audioUrl.slice(0, 40)}"`,
          severity: "error",
        });
      }
    }

    if (storyboard.timeline.length === 0) {
      errors.push({
        field: "integrity",
        message: "Storyboard has no scenes",
        severity: "error",
      });
    }

    const passed = errors.filter((e) => e.severity === "error").length === 0;

    if (passed) {
      logger.info(
        { sceneCount: storyboard.timeline.length },
        "Pre-render validation passed"
      );
    } else {
      logger.warn(
        { errorCount: errors.length, errors: errors.map((e) => e.message) },
        "Pre-render validation failed"
      );
    }

    return {
      passed,
      errors,
      warnings,
      checkedAt: new Date().toISOString(),
    };
  }
}

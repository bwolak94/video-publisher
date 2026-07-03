/**
 * QualityGatesService — FEATURE-07.
 *
 * Orchestrates the post-render quality analysis by:
 *   1. Generating a presigned URL for the rendered S3 file
 *   2. Calling the Python ai-backend POST /api/quality/analyze
 *   3. Saving the resulting QualityReport to DB
 *
 * Called from render.worker.ts after a successful render (non-blocking —
 * errors are logged but do not fail the render job).
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import { S3Service } from "../storage/s3.service";
import { configuration } from "../config/configuration";
import type { QualityReport } from "./quality-gates.types";

const logger = pino({ level: "info" });
const PRESIGN_TTL_SECONDS = 3600; // 1 hour — enough for analysis

@Injectable()
export class QualityGatesService {
  private readonly aiBackendUrl: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly s3: S3Service,
  ) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

  /**
   * Analyze the rendered video and persist the report.
   * Designed to be called fire-and-forget from the render worker.
   */
  async analyzeAndSave(projectId: string, renderedS3Url: string): Promise<void> {
    logger.info({ projectId, renderedS3Url }, "Starting post-render quality analysis");

    // Convert s3:// URI to a presigned HTTPS URL so the Python service can download it
    const s3Key = renderedS3Url.replace(/^s3:\/\/[^/]+\//, "");
    let presignedUrl: string;
    try {
      presignedUrl = await this.s3.getPresignedUrl(s3Key, PRESIGN_TTL_SECONDS);
    } catch (err) {
      logger.error({ err, projectId, s3Key }, "Failed to generate presigned URL for quality analysis");
      return;
    }

    // Call the Python quality analyzer
    let report: QualityReport;
    try {
      const res = await fetch(`${this.aiBackendUrl}/api/quality/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: presignedUrl }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error({ projectId, status: res.status, text }, "Quality analysis HTTP error");
        return;
      }

      report = (await res.json()) as QualityReport;
    } catch (err) {
      logger.error({ err, projectId }, "Quality analysis request failed");
      return;
    }

    // Persist to DB
    try {
      await this.db
        .update(projects)
        .set({
          postRenderQuality: report as any,
          renderQualityScore: String(report.overallScore),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      logger.info(
        { projectId, score: report.overallScore, passed: report.passed, issues: report.issues.length },
        "Post-render quality report saved"
      );
    } catch (err) {
      logger.error({ err, projectId }, "Failed to save quality report to DB");
    }
  }

  /**
   * Persist a pre-render ValidationReport to the project.
   */
  async savePreRenderValidation(
    projectId: string,
    report: import("./quality-gates.types").ValidationReport,
  ): Promise<void> {
    try {
      await this.db
        .update(projects)
        .set({ preRenderValidation: report as any, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
    } catch (err) {
      logger.error({ err, projectId }, "Failed to save pre-render validation to DB");
    }
  }
}

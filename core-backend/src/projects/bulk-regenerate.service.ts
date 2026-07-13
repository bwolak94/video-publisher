/**
 * I2: Bulk scene regeneration with upfront cost preview.
 *
 * Accepts a list of scene IDs and asset types. When `confirm = false` (default),
 * returns an estimated cost breakdown WITHOUT queuing any jobs. When `confirm = true`,
 * checks the project budget and enqueues asset-generation jobs for each scene.
 */
import { Injectable, NotFoundException, BadRequestException, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import { CostEstimatorService } from "../cost/cost-estimator.service";
import { ProjectBudgetService } from "../cost/project-budget.service";
import { QueueService } from "../queue/queue.service";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

export interface BulkRegenerateOptions {
  sceneIds: string[];
  assetTypes: Array<"audio" | "video" | "image">;
  confirm?: boolean;
}

export interface BulkRegenerateResult {
  estimatedCostUsd: number;
  breakdown: { audioTotal: number; videoTotal: number; imageTotal: number; renderTotal: number };
  jobsQueued?: number;
}

@Injectable()
export class BulkRegenerateService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly estimator: CostEstimatorService,
    private readonly budget: ProjectBudgetService,
    private readonly queue: QueueService,
  ) {}

  async run(projectId: string, opts: BulkRegenerateOptions): Promise<BulkRegenerateResult> {
    if (!opts.sceneIds.length) throw new BadRequestException("sceneIds must not be empty");

    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const project = rows[0];
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const storyboard = project.storyboard as VideoStoryboard | null;
    if (!storyboard?.timeline) throw new BadRequestException("Project has no storyboard");

    const targetScenes = storyboard.timeline.filter((s) => opts.sceneIds.includes(s.sceneId));
    if (!targetScenes.length) throw new NotFoundException("None of the requested sceneIds found in storyboard");

    const sceneSummaries = targetScenes.map((s) => ({
      narrationText: s.narrationText,
      durationInSeconds: s.durationInSeconds,
      assetType: opts.assetTypes.includes("image") ? "image" as const : "video" as const,
    }));

    const breakdown = this.estimator.estimate(sceneSummaries);

    if (!opts.confirm) {
      return { estimatedCostUsd: breakdown.total, breakdown };
    }

    // Budget guard before enqueuing
    await this.budget.checkBatchBudget(projectId, breakdown.total);

    // Enqueue one job per scene × assetType combination
    let jobCount = 0;
    for (const scene of targetScenes) {
      for (const assetType of opts.assetTypes) {
        await this.queue.add("asset-generation", {
          jobId: `bulk-${projectId}-${scene.sceneId}-${assetType}-${Date.now()}`,
          projectId,
          sceneId: scene.sceneId,
          step: `bulk-${assetType}`,
          assetType,
          narrationText: assetType === "audio" ? scene.narrationText : undefined,
          voiceId: storyboard.meta.voiceId,
          standardVoiceId: storyboard.meta.voiceId,
          visualPrompt: assetType !== "audio" ? scene.visualPrompt : undefined,
          aspectRatio: storyboard.meta.aspectRatio,
          estimatedCostUsd: breakdown.total / (targetScenes.length * opts.assetTypes.length),
        });
        jobCount++;
      }
    }

    logger.info({ projectId, jobCount, sceneCount: targetScenes.length }, "I2: Bulk regeneration enqueued");
    return { estimatedCostUsd: breakdown.total, breakdown, jobsQueued: jobCount };
  }
}

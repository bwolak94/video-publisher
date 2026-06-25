import { Injectable } from "@nestjs/common";
import pino from "pino";
import { QueueService } from "../queue/queue.service";
import { NicheProfileService } from "./niche-profile.service";

const logger = pino({ level: "info" });

export interface TriggerCycleOptions {
  channelId: string;
  nicheProfileId?: string;
}

@Injectable()
export class WorkerModeService {
  constructor(
    private readonly queue: QueueService,
    private readonly nicheProfiles: NicheProfileService
  ) {}

  async triggerCycle(options: TriggerCycleOptions): Promise<void> {
    const enabled = process.env.WORKER_ENABLED === "true";
    if (!enabled) {
      logger.info({ channelId: options.channelId }, "Worker mode disabled — skipping cycle");
      return;
    }

    const profileId = options.nicheProfileId ?? "tech";
    const profile = this.nicheProfiles.getById(profileId);

    logger.info(
      { channelId: options.channelId, profileId: profile.id },
      "Worker mode cycle triggered"
    );

    const minViralityScore =
      parseFloat(process.env.WORKER_MIN_VIRALITY_SCORE ?? "0.65") || profile.minViralityScore;
    const dedupWindowHours =
      parseInt(process.env.WORKER_DEDUP_WINDOW_HOURS ?? "48", 10);

    await this.queue.add("research", {
      channelId: options.channelId,
      nicheProfileId: profile.id,
      sources: profile.sources,
      deduplicationWindowHours: dedupWindowHours,
      minViralityScore,
    });
  }
}

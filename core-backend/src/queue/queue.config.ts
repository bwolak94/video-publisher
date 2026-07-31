import { type DefaultJobOptions, type QueueOptions } from "bullmq";


export const QUEUE_CONCURRENCY: Record<string, number> = {
  research: 2,
  "asset-generation": 10,
  render: 3,
  localization: 2,
  publish: 3,
  webhook: 5,
};

const researchJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

const assetGenerationJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 3000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 500 },
};

const renderJobOptions: DefaultJobOptions = {
  // I01: render = 2 retries max — renders are expensive (Remotion Lambda cost); cap to avoid runaway spend
  attempts: 2,
  backoff: { type: "exponential", delay: 10_000 }, // 10s, 100s
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 500 },
  // timeout: 1_800_000 — set per-job when calling queue.add() (BullMQ 5 removed it from DefaultJobOptions)
};

const localizationJobOptions: DefaultJobOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

const publishJobOptions: DefaultJobOptions = {
  // I01: publish = 5 retries — social APIs are flaky; more retries prevents missed uploads
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 }, // 10s, 100s, 1000s (capped by platform rate limits)
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

const webhookJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 }, // 5s, 25s, 125s
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 200 },
};

// Per-queue BullMQ Queue options
export const QUEUE_OPTIONS: Record<string, Partial<QueueOptions>> = {
  research: {
    defaultJobOptions: researchJobOptions,
  },
  "asset-generation": {
    defaultJobOptions: assetGenerationJobOptions,
  },
  render: {
    defaultJobOptions: renderJobOptions,
  },
  localization: {
    defaultJobOptions: localizationJobOptions,
  },
  publish: {
    defaultJobOptions: publishJobOptions,
  },
  webhook: {
    defaultJobOptions: webhookJobOptions,
  },
};

// Worker-level stall settings for the research queue
// (in BullMQ 5+ stalledInterval/maxStalledCount live on Worker, not Queue)
export const RESEARCH_WORKER_SETTINGS = {
  stalledInterval: 30_000,
  maxStalledCount: 2,
};

// Publish jobs (TikTok/YouTube uploads) can take >30s; 2-min stall interval
// avoids false stall re-queues during slow social API responses.
export const PUBLISH_WORKER_SETTINGS = {
  stalledInterval: 120_000, // 2 minutes
  maxStalledCount: 2,
} as const;

// Webhook delivery is fast HTTP — 60s stall window with generous retry count.
export const WEBHOOK_WORKER_SETTINGS = {
  stalledInterval: 60_000,
  maxStalledCount: 3,
} as const;

// Asset-generation jobs (Runway/Kling video, ElevenLabs audio) can take up to
// several minutes — use a 2-min stall interval to avoid false stall re-queues.
// maxStalledCount: 2 — allow two re-queues before treating as permanently stalled.
export const ASSET_GENERATION_WORKER_SETTINGS = {
  stalledInterval: 120_000, // 2 min
  maxStalledCount: 2,
};

// Render jobs can run up to 30 min — use a 5-min stall interval so an
// in-progress Remotion Lambda render is never incorrectly flagged as stalled.
// maxStalledCount: 1 — renders are expensive; only allow one re-queue on stall.
export const RENDER_WORKER_SETTINGS = {
  stalledInterval: 300_000, // 5 min
  maxStalledCount: 1,
};

// Job priority constants — lower number = higher priority in BullMQ.
// Pass via QueueService.add(queue, payload, { priority: JOB_PRIORITY.CREATOR }).
export const JOB_PRIORITY = {
  /** Creator mode: human is waiting — run first. */
  CREATOR: 1,
  /** Worker mode: background batch — run after interactive jobs. */
  WORKER: 10,
} as const;

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
  removeOnFail: false,
};

const assetGenerationJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 3000 },
  removeOnComplete: { count: 500 },
  removeOnFail: false,
};

const renderJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 50 },
  removeOnFail: false,
  // timeout: 1_800_000 — set per-job when calling queue.add() (BullMQ 5 removed it from DefaultJobOptions)
};

const localizationJobOptions: DefaultJobOptions = {
  attempts: 2,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

const publishJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: false,
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

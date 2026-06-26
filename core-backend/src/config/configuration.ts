export interface WorkerConfig {
  enabled: boolean;
  cronSchedule: string;
  aiBackendUrl: string;
  minViralityScore: number;
  dedupWindowHours: number;
  notificationWebhook: string;
}

export interface AppConfig {
  port: number;
  database: {
    url: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    publicKey: string;
    privateKey: string;
  };
  youtubeRedirectUri: string;
  worker: WorkerConfig;
}

export function configuration(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? "3001", 10),
    database: {
      url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/video_publisher",
    },
    redis: {
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    },
    jwt: {
      // In production these come from Vault/Secrets Manager
      publicKey: process.env.JWT_PUBLIC_KEY ?? "",
      privateKey: process.env.JWT_PRIVATE_KEY ?? "",
    },
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? "http://localhost:3002/api/youtube/callback",
    worker: {
      enabled: process.env.WORKER_ENABLED === "true",
      cronSchedule: process.env.WORKER_CRON_SCHEDULE ?? "0 * * * *",
      aiBackendUrl: process.env.AI_BACKEND_URL ?? "http://localhost:8000",
      minViralityScore: parseFloat(process.env.WORKER_MIN_VIRALITY_SCORE ?? "0.65"),
      dedupWindowHours: parseInt(process.env.WORKER_DEDUP_WINDOW_HOURS ?? "48", 10),
      notificationWebhook: process.env.WORKER_NOTIFICATION_WEBHOOK ?? "",
    },
  };
}

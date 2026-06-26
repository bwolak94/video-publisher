export type Platform = "youtube" | "tiktok" | "instagram";

export interface PublishOptions {
  projectId: string;
  channelId: string;
  s3Key: string;
  totalBytes: number;
  title: string;
  description: string;
  tags: string[];
  privacyStatus?: "private" | "public";
  publishAt?: string;
}

export interface PublishResult {
  platform: Platform;
  platformVideoId: string;
  url?: string;
}

export interface VideoPublisher {
  readonly platform: Platform;
  upload(options: PublishOptions): Promise<PublishResult>;
}

/**
 * AvatarService — orchestrates talking-head video generation for a scene (FEATURE-11).
 *
 * Responsibilities:
 *  1. Load the scene's storyboard entry to get its audioUrl and existing avatarConfig.
 *  2. Route to the AvatarProviderRegistry (Wav2Lip → HeyGen → D-ID by score).
 *  3. Update the scene's videoUrl in the storyboard with the generated avatar video.
 *  4. Persist the avatarConfig back into the storyboard.
 */
import { Injectable, Inject } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import { AvatarProviderRegistry } from "./avatar-provider-registry";
import type { VideoStoryboard, AvatarConfig } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

export interface GenerateAvatarParams {
  sceneId: string;
  projectId: string;
  avatarConfig: AvatarConfig;
}

export interface AvatarResult {
  videoUrl: string;     // s3:// URL
  provider: string;
}

@Injectable()
export class AvatarService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly registry: AvatarProviderRegistry,
  ) {}

  async generateAvatar(params: GenerateAvatarParams): Promise<AvatarResult> {
    const { sceneId, projectId, avatarConfig } = params;

    // 1. Load project + find the scene
    const rows = await this.db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const project = rows[0];
    if (!project) throw new Error(`Project ${projectId} not found`);

    const storyboard = project.storyboard as VideoStoryboard;
    const scene = storyboard?.timeline?.find((s) => s.sceneId === sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found in project ${projectId}`);

    const audioUrl = scene.audioUrl;
    if (!audioUrl) throw new Error(`Scene ${sceneId} has no audioUrl — generate audio first`);

    logger.info({ sceneId, provider: avatarConfig.provider }, "Generating avatar video");

    // 2. Generate via registry
    const { s3Url, provider } = await this.registry.generate({
      audioUrl,
      imageUrl: avatarConfig.avatarImageUrl,
      sceneId,
      preferredProvider: avatarConfig.provider,
      avatarId: avatarConfig.avatarId,
    });

    // 3. Persist updated storyboard: set videoUrl + avatarConfig on scene
    const updatedTimeline = storyboard.timeline.map((s) =>
      s.sceneId === sceneId
        ? { ...s, videoUrl: s3Url, videoProvider: provider, avatarConfig }
        : s,
    );
    await this.db
      .update(projects)
      .set({ storyboard: { ...storyboard, timeline: updatedTimeline }, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return { videoUrl: s3Url, provider };
  }
}

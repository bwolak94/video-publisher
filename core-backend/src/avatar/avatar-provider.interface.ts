/** Common interface for all avatar/talking-head video providers (FEATURE-11). */
export interface AvatarProvider {
  readonly name: "heygen" | "did" | "wav2lip_local";

  scores: {
    quality: number;     // 1-5
    cost: number;        // 1-5 (5 = free)
    reliability: number; // 1-5
    latency: number;     // 1-5 (5 = fastest)
  };

  /** Returns true when this provider can currently handle requests. */
  isAvailable(): Promise<boolean>;

  /**
   * Generate a talking-head video.
   * @param audioUrl  Public HTTPS URL or s3:// URL of the narration audio.
   * @param imageUrl  s3:// URL of the avatar/presenter image.
   * @param avatarId  Optional provider-specific avatar identifier (HeyGen).
   * @returns s3:// URL of the generated MP4 video.
   */
  generate(params: {
    audioUrl: string;
    imageUrl: string;
    sceneId: string;
    avatarId?: string;
  }): Promise<string>;
}

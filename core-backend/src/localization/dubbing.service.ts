/**
 * DubbingService (FEATURE-10).
 *
 * Re-generates narration audio for every scene in a storyboard using the
 * TtsProviderRegistry (which routes to ElevenLabs or local Piper depending on
 * the voiceId prefix). Returns an updated storyboard with new audioUrls.
 *
 * Each scene is processed sequentially to avoid hammering the TTS provider.
 */
import { Injectable } from "@nestjs/common";
import pino from "pino";
import { TtsProviderRegistry } from "../elevenlabs/tts-provider-registry";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

@Injectable()
export class DubbingService {
  constructor(private readonly tts: TtsProviderRegistry) {}

  /**
   * Re-generate audio for all scenes in a storyboard using `targetVoiceId`.
   * Returns a new storyboard object with populated audioUrls.
   */
  async regenerateAudio(storyboard: VideoStoryboard, targetVoiceId: string): Promise<VideoStoryboard> {
    const updatedTimeline = [...storyboard.timeline];

    for (let i = 0; i < updatedTimeline.length; i++) {
      const scene = updatedTimeline[i];
      if (!scene.narrationText?.trim()) continue;

      try {
        const audioUrl = await this.tts.generateAudio({
          narrationText: scene.narrationText,
          voiceId: targetVoiceId,
          standardVoiceId: targetVoiceId,
        });

        updatedTimeline[i] = { ...scene, audioUrl, audioCacheKey: undefined };
        logger.info({ sceneId: scene.sceneId, voiceId: targetVoiceId }, "Dubbed scene audio");
      } catch (err) {
        logger.error({ sceneId: scene.sceneId, err }, "Failed to dub scene; keeping scene without audio");
        updatedTimeline[i] = { ...scene, audioUrl: undefined };
      }
    }

    return { ...storyboard, timeline: updatedTimeline };
  }
}

import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { SettingsService } from "../settings/settings.service";
import type { MusicProvider, MusicProviderScores } from "./music-provider.interface";
import type { MusicGenerateParams, MusicMood, MusicProviderName, MusicTrack } from "./music.types";

const logger = pino({ level: "info" });

export const STABILITY_AUDIO_HTTP = Symbol("STABILITY_AUDIO_HTTP");

const MOOD_PROMPTS: Record<MusicMood, string> = {
  cinematic:  "Epic orchestral cinematic score, sweeping strings, dramatic horns, no vocals",
  upbeat:     "Upbeat energetic pop music, bright synths, driving beat, no vocals",
  calm:       "Calm ambient meditation music, soft piano, gentle pads, no vocals",
  dramatic:   "Dramatic suspenseful music, dark strings, building tension, no vocals",
  inspiring:  "Inspiring motivational music, uplifting melody, positive energy, no vocals",
  fun:        "Fun lighthearted playful music, ukulele, happy melody, no vocals",
};

const STABILITY_AUDIO_URL = "https://api.stability.ai/v2beta/audio/stable-audio-1-0/generate";

/**
 * Stability AI audio provider — AI-generated music, highest quality.
 * Scores: quality=5, cost=2 (paid), reliability=4, latency=3 (slow generation)
 * Composite (q×4 + c×1 + r×2 + l×1): 20+2+8+3 = 33
 */
@Injectable()
export class StabilityAudioService implements MusicProvider {
  readonly name: MusicProviderName = "stability_audio";
  readonly scores: MusicProviderScores = {
    quality:     5, // best AI-generated quality
    cost:        2, // paid API
    reliability: 4,
    latency:     3, // generation takes ~10-30s
  };

  constructor(
    @Inject(STABILITY_AUDIO_HTTP) private readonly http: typeof fetch,
    private readonly settings: SettingsService,
    private readonly s3: S3Service,
  ) {}

  async isAvailable(): Promise<boolean> {
    const key = await this.getApiKey();
    return !!key;
  }

  async generate(params: MusicGenerateParams): Promise<MusicTrack> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error("Stability AI API key not configured");

    const prompt = MOOD_PROMPTS[params.mood];
    const duration = Math.min(Math.max(params.durationSeconds, 5), 180); // API limits 5-180s

    logger.info({ mood: params.mood, duration, projectId: params.projectId }, "Generating Stability Audio");

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("seconds_total", String(Math.round(duration)));
    form.append("output_format", "mp3");

    const res = await this.http(STABILITY_AUDIO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Stability Audio error: ${res.status} ${text}`);
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    const slug = `${params.mood}-${Date.now()}`;
    const path = `music/stability-${slug}.mp3`;
    const s3Url = await this.s3.uploadBuffer(path, audioBuffer, "audio/mpeg");

    logger.info({ path, projectId: params.projectId }, "Stability Audio uploaded to S3");

    return {
      s3Url,
      provider: this.name,
      mood: params.mood,
      title: `AI Music — ${params.mood}`,
      license: "CC0-1.0",
      durationSeconds: duration,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getApiKey(): Promise<string | null> {
    return this.settings.getPlaintext("integrations.stabilityKey");
  }
}

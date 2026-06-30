import { Injectable, Inject } from "@nestjs/common";
import { Readable } from "stream";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { SettingsService } from "../settings/settings.service";
import type { MusicProvider, MusicProviderScores } from "./music-provider.interface";
import type { MusicGenerateParams, MusicMood, MusicProviderName, MusicTrack } from "./music.types";

const logger = pino({ level: "info" });

export const JAMENDO_HTTP = Symbol("JAMENDO_HTTP");

const MOOD_TAGS: Record<MusicMood, string[]> = {
  cinematic:  ["cinematic", "orchestral", "epic"],
  upbeat:     ["upbeat", "energetic", "pop"],
  calm:       ["calm", "ambient", "relaxing"],
  dramatic:   ["dramatic", "suspense", "tension"],
  inspiring:  ["inspiring", "motivational", "positive"],
  fun:        ["fun", "happy", "light"],
};

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  audio: string; // direct MP3 download URL
  duration: number; // seconds
  license_ccurl: string;
}

interface JamendoResponse {
  results: JamendoTrack[];
}

/**
 * Jamendo provider — CC-licensed music via free public API.
 * Scores: quality=4, cost=5 (free), reliability=3, latency=4
 * Composite (q×4 + c×1 + r×2 + l×1): 16+5+6+4 = 31
 */
@Injectable()
export class JamendoMusicService implements MusicProvider {
  readonly name: MusicProviderName = "jamendo";
  readonly scores: MusicProviderScores = {
    quality:     4,
    cost:        5, // free
    reliability: 3, // public API — occasionally rate-limited
    latency:     4,
  };

  constructor(
    @Inject(JAMENDO_HTTP) private readonly http: typeof fetch,
    private readonly settings: SettingsService,
    private readonly s3: S3Service,
  ) {}

  async isAvailable(): Promise<boolean> {
    const clientId = await this.getClientId();
    return !!clientId;
  }

  async generate(params: MusicGenerateParams): Promise<MusicTrack> {
    const clientId = await this.getClientId();
    if (!clientId) throw new Error("Jamendo client ID not configured");

    const tags = MOOD_TAGS[params.mood];
    const tag = tags[0];

    const url = new URL("https://api.jamendo.com/v3.0/tracks/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "10");
    url.searchParams.set("tags", tag);
    url.searchParams.set("vocalinstrumental", "instrumental");
    url.searchParams.set("audioformat", "mp32");
    url.searchParams.set("order", "popularity_total_desc");

    logger.info({ mood: params.mood, tag, projectId: params.projectId }, "Fetching Jamendo tracks");

    const res = await this.http(url.toString());
    if (!res.ok) {
      throw new Error(`Jamendo API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as JamendoResponse;
    if (!data.results?.length) {
      throw new Error(`No Jamendo tracks found for mood="${params.mood}" tag="${tag}"`);
    }

    // Pick track closest to target duration
    const track = this.pickClosestDuration(data.results, params.durationSeconds);

    logger.info({ id: track.id, title: track.name, duration: track.duration }, "Downloading Jamendo track");

    const s3Url = await this.downloadAndUpload(track, params.mood);

    return {
      s3Url,
      provider: this.name,
      mood: params.mood,
      title: track.name,
      artist: track.artist_name,
      license: "CC-BY",
      durationSeconds: track.duration,
      generatedAt: new Date().toISOString(),
    };
  }

  private pickClosestDuration(tracks: JamendoTrack[], target: number): JamendoTrack {
    return tracks.reduce((best, t) =>
      Math.abs(t.duration - target) < Math.abs(best.duration - target) ? t : best
    );
  }

  protected async downloadAndUpload(track: JamendoTrack, mood: MusicMood): Promise<string> {
    const res = await this.http(track.audio);
    if (!res.ok || !res.body) throw new Error(`Failed to download Jamendo audio: ${res.status}`);

    const stream = Readable.fromWeb(res.body as any);
    const path = `music/jamendo-${track.id}-${mood}.mp3`;
    return this.s3.uploadStream(path, stream, "audio/mpeg");
  }

  private async getClientId(): Promise<string | null> {
    return this.settings.getPlaintext("integrations.jamendoClientId");
  }
}

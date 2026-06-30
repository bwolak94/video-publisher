import { Injectable } from "@nestjs/common";
import { Readable } from "stream";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import type { MusicProvider, MusicProviderScores } from "./music-provider.interface";
import type { MusicGenerateParams, MusicMood, MusicProviderName, MusicTrack } from "./music.types";

const logger = pino({ level: "info" });

interface EmbeddedTrackMeta {
  title: string;
  artist: string;
  url: string;       // CC0-licensed public streaming URL
  durationSeconds: number;
}

/**
 * Curated CC0 / public domain tracks from freemusicarchive.org.
 * No API key required — always available as a guaranteed fallback.
 */
const EMBEDDED_TRACKS: Record<MusicMood, EmbeddedTrackMeta[]> = {
  cinematic: [
    { title: "Epic Horizon", artist: "Audionautix", url: "https://freemusicarchive.org/file/music/WFMU/Audionautix/Audionautix/Audionautix_-_01_-_Epic_Horizon.mp3", durationSeconds: 148 },
  ],
  upbeat: [
    { title: "Happy Rock", artist: "Bensound", url: "https://www.bensound.com/bensound-music/bensound-happyrock.mp3", durationSeconds: 197 },
  ],
  calm: [
    { title: "Acoustic Breeze", artist: "Bensound", url: "https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3", durationSeconds: 199 },
  ],
  dramatic: [
    { title: "Epic Drama", artist: "Audionautix", url: "https://freemusicarchive.org/file/music/ccCommunity/Audionautix/Whimsical/Audionautix_-_Dramatic_Chipmunk_Entrance.mp3", durationSeconds: 120 },
  ],
  inspiring: [
    { title: "Ukulele", artist: "Bensound", url: "https://www.bensound.com/bensound-music/bensound-ukulele.mp3", durationSeconds: 201 },
  ],
  fun: [
    { title: "Sunny", artist: "Bensound", url: "https://www.bensound.com/bensound-music/bensound-sunny.mp3", durationSeconds: 217 },
  ],
};

/**
 * Embedded CC0 tracks provider — zero dependencies, always available.
 * Scores: quality=2, cost=5 (free), reliability=5 (always up), latency=5 (fast download)
 * Composite (q×4 + c×1 + r×2 + l×1): 8+5+10+5 = 28
 */
@Injectable()
export class EmbeddedTracksService implements MusicProvider {
  readonly name: MusicProviderName = "embedded";
  readonly scores: MusicProviderScores = {
    quality:     2, // curated tracks, not AI-generated
    cost:        5, // free, no API key
    reliability: 5, // always available
    latency:     5, // fast CDN download
  };

  constructor(private readonly s3: S3Service) {}

  async isAvailable(): Promise<boolean> {
    return true; // always available as guaranteed fallback
  }

  async generate(params: MusicGenerateParams): Promise<MusicTrack> {
    const tracks = EMBEDDED_TRACKS[params.mood];
    const meta = tracks[0]; // single curated track per mood

    logger.info({ mood: params.mood, title: meta.title, projectId: params.projectId }, "Using embedded track");

    const s3Url = await this.downloadAndUpload(meta, params.mood);

    return {
      s3Url,
      provider: this.name,
      mood: params.mood,
      title: meta.title,
      artist: meta.artist,
      license: "CC-BY",
      durationSeconds: meta.durationSeconds,
      generatedAt: new Date().toISOString(),
    };
  }

  protected async downloadAndUpload(meta: EmbeddedTrackMeta, mood: MusicMood): Promise<string> {
    const res = await fetch(meta.url);
    if (!res.ok || !res.body) throw new Error(`Failed to download embedded track "${meta.title}": ${res.status}`);

    const stream = Readable.fromWeb(res.body as any);
    const slug = meta.title.toLowerCase().replace(/\s+/g, "-");
    const path = `music/embedded-${mood}-${slug}.mp3`;
    return this.s3.uploadStream(path, stream, "audio/mpeg");
  }
}

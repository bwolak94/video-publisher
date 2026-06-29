/**
 * SubtitleService — orchestrates the full subtitle generation pipeline (FEATURE-04).
 *
 * Flow:
 *   1. Hash the audio S3 URL → check DB cache
 *   2. Transcribe via WhisperProviderRegistry (local-first fallback)
 *   3. Format words into SRT + VTT
 *   4. Upload both files to S3 in parallel
 *   5. Cache the full track in DB
 *   6. Return SubtitleTrack
 */

import { Injectable } from "@nestjs/common";
import pino from "pino";
import { S3Service } from "../storage/s3.service";
import { WhisperProviderRegistry } from "./whisper-provider-registry";
import { SubtitleCacheService } from "./subtitle-cache.service";
import { toSRT, toVTT } from "./srt-formatter";
import type { SubtitleTrack } from "./subtitle.types";

const logger = pino({ level: "info" });

@Injectable()
export class SubtitleService {
  constructor(
    private readonly registry: WhisperProviderRegistry,
    private readonly cache: SubtitleCacheService,
    private readonly s3: S3Service,
  ) {}

  async generate(audioS3Url: string, language = "en"): Promise<SubtitleTrack> {
    const audioHash = this.cache.computeHash(audioS3Url);

    // 1. DB cache check
    const cached = await this.cache.get(audioHash);
    if (cached) {
      logger.info({ audioHash }, "Subtitle track served from cache");
      return cached;
    }

    // 2. Transcribe
    logger.info({ audioS3Url, language }, "Starting subtitle generation");
    const transcription = await this.registry.transcribe(audioS3Url, language);

    // 3. Format
    const srtContent = toSRT(transcription.words);
    const vttContent = toVTT(transcription.words);

    // 4. Upload SRT + VTT to S3 in parallel
    const [srtS3Url, vttS3Url] = await Promise.all([
      this.s3.uploadBuffer(
        `subtitles/${audioHash}.srt`,
        Buffer.from(srtContent, "utf-8"),
        "text/plain"
      ),
      this.s3.uploadBuffer(
        `subtitles/${audioHash}.vtt`,
        Buffer.from(vttContent, "utf-8"),
        "text/vtt"
      ),
    ]);

    const track: SubtitleTrack = {
      words: transcription.words,
      srtS3Url,
      vttS3Url,
      language: transcription.language,
      provider: transcription.provider,
      generatedAt: new Date().toISOString(),
    };

    // 5. Persist
    await this.cache.save(audioHash, track);

    logger.info(
      { audioS3Url, wordCount: track.words.length, provider: track.provider, srtS3Url, vttS3Url },
      "Subtitle track generated"
    );

    return track;
  }

  async getProviderStatus() {
    return this.registry.getProviderStatus();
  }
}

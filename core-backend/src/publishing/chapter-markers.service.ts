/**
 * F1: AI chapter markers for YouTube.
 *
 * Sends the storyboard narration + scene durations to GPT-4o and returns
 * YouTube-formatted chapter timestamps:
 *   00:00 Intro
 *   00:12 Why this matters
 *   00:35 ...
 *
 * Persisted on the project row (`projects.chapterMarkers`) and appended to the
 * YouTube video description at publish time.
 */
import { Injectable } from "@nestjs/common";
import pino from "pino";
import type { VideoStoryboard } from "../storyboard/video-storyboard";

const logger = pino({ level: "info" });

export interface ChapterMarker {
  offsetSeconds: number;
  label: string;
}

@Injectable()
export class ChapterMarkersService {
  /**
   * Generate chapter markers for a storyboard using the OpenAI API directly.
   * Returns an ordered list of { offsetSeconds, label } entries.
   */
  async generate(storyboard: VideoStoryboard): Promise<ChapterMarker[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn("OPENAI_API_KEY not set — skipping chapter marker generation");
      return [];
    }

    const { narration, offsets } = this.buildNarrationWithOffsets(storyboard);

    const prompt = [
      "You are a YouTube video editor. Given the narration transcript below with scene timestamps,",
      "generate 3-8 concise chapter titles. Return ONLY a JSON array like:",
      `[{"offsetSeconds": 0, "label": "Intro"}, ...]`,
      "Use the scene timestamps as reference — chapters must align with scene boundaries.",
      "",
      "Narration with timestamps:",
      narration,
    ].join("\n");

    let raw: string;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, "F1: GPT-4o chapter marker call failed");
        return this.fallbackMarkers(offsets);
      }

      const json = await res.json() as any;
      raw = json.choices?.[0]?.message?.content ?? "[]";
    } catch (err) {
      logger.warn({ err }, "F1: Chapter marker generation failed — using scene fallback");
      return this.fallbackMarkers(offsets);
    }

    try {
      const parsed = JSON.parse(raw);
      const chapters: ChapterMarker[] = Array.isArray(parsed) ? parsed : (parsed.chapters ?? []);
      logger.info({ count: chapters.length }, "F1: Chapter markers generated");
      return chapters;
    } catch {
      return this.fallbackMarkers(offsets);
    }
  }

  /**
   * Format chapter markers as a YouTube-compatible description block.
   * YouTube requires the first chapter to start at 00:00.
   */
  formatForDescription(markers: ChapterMarker[]): string {
    if (markers.length === 0) return "";
    const hasIntro = markers[0]?.offsetSeconds === 0;
    const list = hasIntro ? markers : [{ offsetSeconds: 0, label: "Intro" }, ...markers];
    return list.map((m) => `${this.formatTimestamp(m.offsetSeconds)} ${m.label}`).join("\n");
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildNarrationWithOffsets(storyboard: VideoStoryboard): { narration: string; offsets: number[] } {
    let elapsed = 0;
    const lines: string[] = [];
    const offsets: number[] = [];

    for (const scene of storyboard.timeline) {
      offsets.push(elapsed);
      const ts = this.formatTimestamp(elapsed);
      lines.push(`[${ts}] ${scene.narrationText}`);
      elapsed += scene.durationInSeconds ?? 5;
    }

    return { narration: lines.join("\n"), offsets };
  }

  /** Fall back to one chapter per scene when GPT-4o is unavailable. */
  private fallbackMarkers(offsets: number[]): ChapterMarker[] {
    return offsets.map((offset, i) => ({ offsetSeconds: offset, label: `Scene ${i + 1}` }));
  }

  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
}

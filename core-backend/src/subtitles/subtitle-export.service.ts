/**
 * F4: SRT / VTT subtitle export from storyboard subtitle tracks.
 *
 * Concatenates per-scene SubtitleTrack word timestamps into a single
 * document-level SRT or VTT file, adjusting offsets by scene start time.
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import type { VideoStoryboard, WordTimestamp } from "../storyboard/video-storyboard";

@Injectable()
export class SubtitleExportService {
  /** Build a full-video SRT string from the storyboard. */
  toSrt(storyboard: VideoStoryboard): string {
    const entries = this.buildEntries(storyboard);
    if (entries.length === 0) throw new NotFoundException("No subtitles found in storyboard");

    return entries
      .map(({ index, start, end, text }) =>
        `${index}\n${this.formatSrtTime(start)} --> ${this.formatSrtTime(end)}\n${text}\n`,
      )
      .join("\n");
  }

  /** Build a full-video VTT string from the storyboard. */
  toVtt(storyboard: VideoStoryboard): string {
    const entries = this.buildEntries(storyboard);
    if (entries.length === 0) throw new NotFoundException("No subtitles found in storyboard");

    const body = entries
      .map(({ start, end, text }) =>
        `${this.formatVttTime(start)} --> ${this.formatVttTime(end)}\n${text}\n`,
      )
      .join("\n");

    return `WEBVTT\n\n${body}`;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildEntries(storyboard: VideoStoryboard): Array<{ index: number; start: number; end: number; text: string }> {
    const entries: Array<{ index: number; start: number; end: number; text: string }> = [];
    let sceneOffset = 0;
    let cueIndex = 1;

    for (const scene of storyboard.timeline) {
      const words = scene.subtitleTrack?.words ?? [];
      if (words.length === 0) {
        sceneOffset += scene.durationInSeconds ?? 5;
        continue;
      }

      // Group words into ~5-word cues
      const groups = this.groupWords(words, 5);
      for (const group of groups) {
        const start = sceneOffset + group[0].start;
        const end = sceneOffset + group[group.length - 1].end;
        const text = group.map((w) => w.word).join(" ");
        entries.push({ index: cueIndex++, start, end, text });
      }

      sceneOffset += scene.durationInSeconds ?? 5;
    }

    return entries;
  }

  private groupWords(words: WordTimestamp[], size: number): WordTimestamp[][] {
    const groups: WordTimestamp[][] = [];
    for (let i = 0; i < words.length; i += size) {
      groups.push(words.slice(i, i + size));
    }
    return groups;
  }

  private formatSrtTime(seconds: number): string {
    return this.formatTime(seconds, ",");
  }

  private formatVttTime(seconds: number): string {
    return this.formatTime(seconds, ".");
  }

  private formatTime(seconds: number, msSep: string): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${msSep}${String(ms).padStart(3, "0")}`;
  }
}

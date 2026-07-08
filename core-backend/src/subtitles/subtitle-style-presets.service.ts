import { Injectable } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service";

export interface SubtitleStyle {
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  position: "top" | "center" | "bottom";
  highlightColor: string;
  bold: boolean;
  allCaps: boolean;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  description: string;
  style: SubtitleStyle;
  builtIn: boolean;
}

const BUILT_IN_PRESETS: SubtitlePreset[] = [
  {
    id: "youtube-default",
    name: "YouTube Default",
    description: "Clean white text with semi-transparent black background — optimised for YouTube",
    builtIn: true,
    style: {
      fontSize: 32,
      fontFamily: "YouTube Noto, sans-serif",
      color: "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.6)",
      position: "bottom",
      highlightColor: "#FFD700",
      bold: false,
      allCaps: false,
    },
  },
  {
    id: "tiktok-bold",
    name: "TikTok Bold",
    description: "Large, bold uppercase text with stroke — optimised for 9:16 vertical video",
    builtIn: true,
    style: {
      fontSize: 44,
      fontFamily: "Inter, sans-serif",
      color: "#FFFFFF",
      backgroundColor: "transparent",
      position: "center",
      highlightColor: "#FF2D55",
      bold: true,
      allCaps: true,
    },
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Small, unobtrusive lower-third — best for talking-head or documentary content",
    builtIn: true,
    style: {
      fontSize: 24,
      fontFamily: "Inter, sans-serif",
      color: "#E0E0E0",
      backgroundColor: "transparent",
      position: "bottom",
      highlightColor: "#FFFFFF",
      bold: false,
      allCaps: false,
    },
  },
  {
    id: "karaoke",
    name: "Karaoke",
    description: "Word-by-word highlight in gold — great for music videos or lyric videos",
    builtIn: true,
    style: {
      fontSize: 36,
      fontFamily: "Inter, sans-serif",
      color: "#CCCCCC",
      backgroundColor: "rgba(0,0,0,0.5)",
      position: "bottom",
      highlightColor: "#FFD700",
      bold: false,
      allCaps: false,
    },
  },
  {
    id: "news-ticker",
    name: "News Ticker",
    description: "All-caps with bright yellow highlight — broadcast news aesthetic",
    builtIn: true,
    style: {
      fontSize: 28,
      fontFamily: "Arial, sans-serif",
      color: "#FFFFFF",
      backgroundColor: "rgba(20,20,20,0.85)",
      position: "bottom",
      highlightColor: "#FFDD00",
      bold: true,
      allCaps: true,
    },
  },
  {
    id: "accessible",
    name: "Accessible",
    description: "High-contrast, large text — meets WCAG 2.1 contrast guidelines",
    builtIn: true,
    style: {
      fontSize: 40,
      fontFamily: "Arial, sans-serif",
      color: "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.85)",
      position: "bottom",
      highlightColor: "#00FF88",
      bold: true,
      allCaps: false,
    },
  },
];

const CUSTOM_PRESETS_SETTINGS_KEY = "subtitlePresets.custom";

/**
 * Manages subtitle style presets.
 * Built-in presets are hardcoded; user-created presets are stored in appSettings as JSON.
 */
@Injectable()
export class SubtitleStylePresetsService {
  constructor(private readonly settings: SettingsService) {}

  /** Return all presets (built-in + user-created). */
  async listAll(): Promise<SubtitlePreset[]> {
    const custom = await this.listCustom();
    return [...BUILT_IN_PRESETS, ...custom];
  }

  async findById(id: string): Promise<SubtitlePreset | null> {
    const all = await this.listAll();
    return all.find((p) => p.id === id) ?? null;
  }

  /** Save a user-created preset. Overwrites if same id already exists. */
  async save(preset: Omit<SubtitlePreset, "builtIn">): Promise<SubtitlePreset> {
    const custom = await this.listCustom();
    const idx = custom.findIndex((p) => p.id === preset.id);
    const full: SubtitlePreset = { ...preset, builtIn: false };

    if (idx >= 0) {
      custom[idx] = full;
    } else {
      custom.push(full);
    }

    await this.settings.set(CUSTOM_PRESETS_SETTINGS_KEY, JSON.stringify(custom), false);
    return full;
  }

  /** Delete a user-created preset by id. Built-in presets cannot be deleted. */
  async delete(id: string): Promise<boolean> {
    const builtin = BUILT_IN_PRESETS.some((p) => p.id === id);
    if (builtin) return false;

    const custom = await this.listCustom();
    const filtered = custom.filter((p) => p.id !== id);
    await this.settings.set(CUSTOM_PRESETS_SETTINGS_KEY, JSON.stringify(filtered), false);
    return true;
  }

  private async listCustom(): Promise<SubtitlePreset[]> {
    const raw = await this.settings.getPlaintext(CUSTOM_PRESETS_SETTINGS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SubtitlePreset[];
    } catch {
      return [];
    }
  }
}

/**
 * LocalizationService (FEATURE-10).
 *
 * Translates a VideoStoryboard's narration texts into a target language using
 * OpenAI GPT-4o in a single batched API call, then creates a child project in
 * the DB that is linked back to the original via parentProjectId.
 */
import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import pino from "pino";
import { DRIZZLE } from "../db/db.module";
import { projects } from "../db/schema";
import type { VideoStoryboard } from "../storyboard/video-storyboard";
import { SettingsService } from "../settings/settings.service";

const logger = pino({ level: "info" });

/** Injected fetch — replaced with jest.fn() in tests. */
export const OPENAI_TRANSLATE_HTTP = Symbol("OPENAI_TRANSLATE_HTTP");

/** Supported target language labels passed to the model. */
const LANGUAGE_NAMES: Record<string, string> = {
  de: "German",
  fr: "French",
  pl: "Polish",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese (Simplified)",
  ar: "Arabic",
  tr: "Turkish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
};

@Injectable()
export class LocalizationService {
  private readonly baseUrl: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    @Inject(OPENAI_TRANSLATE_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Translate all narrationTexts in the storyboard to `targetLanguage`.
   * Returns a new storyboard object — audioUrls are cleared so they get re-generated.
   */
  async translateStoryboard(
    storyboard: VideoStoryboard,
    targetLanguage: string,
  ): Promise<VideoStoryboard> {
    const scenes = storyboard.timeline;
    if (scenes.length === 0) return storyboard;

    const languageName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;
    const narrations = scenes.map((s) => s.narrationText);

    logger.info({ targetLanguage, sceneCount: scenes.length }, "Translating storyboard");

    const translated = await this.batchTranslate(narrations, languageName);

    const updatedTimeline = scenes.map((scene, i) => ({
      ...scene,
      narrationText: translated[i] ?? scene.narrationText,
      // Clear cached audio — must be regenerated for the new language
      audioUrl: undefined,
      audioCacheKey: undefined,
      // Clear subtitles — they belong to the original language
      subtitleTrack: undefined,
    }));

    return {
      meta: {
        ...storyboard.meta,
        language: targetLanguage as VideoStoryboard["meta"]["language"],
      },
      timeline: updatedTimeline,
    };
  }

  /**
   * Create a child (localized) project row in the DB linked to the original.
   * Status is set to "localizing" so the frontend can show a spinner.
   */
  async createLocalizedProject(
    originalProjectId: string,
    storyboard: VideoStoryboard,
    targetLanguage: string,
    title: string,
  ): Promise<string> {
    const rows = await this.db
      .insert(projects)
      .values({
        title,
        mode: "creator",
        status: "localizing",
        storyboard,
        language: targetLanguage,
        isLocalization: true,
        parentProjectId: originalProjectId,
      })
      .returning();
    return rows[0].id as string;
  }

  /**
   * Update the storyboard of a child project and mark it ready.
   */
  async finalizeLocalization(childProjectId: string, storyboard: VideoStoryboard): Promise<void> {
    await this.db
      .update(projects)
      .set({ storyboard, status: "draft", updatedAt: new Date() })
      .where(eq(projects.id, childProjectId));
  }

  /**
   * Mark a child project as failed.
   */
  async markLocalizationFailed(childProjectId: string, error: string): Promise<void> {
    await this.db
      .update(projects)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(projects.id, childProjectId));
    logger.error({ childProjectId, error }, "Localization failed");
  }

  /** Return all child (localized) projects of a given original project. */
  async findLocalizations(originalProjectId: string): Promise<any[]> {
    return this.db
      .select()
      .from(projects)
      .where(eq(projects.parentProjectId, originalProjectId));
  }

  /** Load a project by ID, throws NotFoundException if missing. */
  async loadProject(projectId: string): Promise<any> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException(`Project ${projectId} not found`);
    return rows[0];
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Translate an array of narration texts in a single OpenAI call.
   * The model returns a JSON array of translated strings in the same order.
   */
  private async batchTranslate(texts: string[], languageName: string): Promise<string[]> {
    const apiKey = await this.getApiKey();
    const systemPrompt = [
      `You are a professional video narration translator.`,
      `Translate each item in the JSON array from its original language to ${languageName}.`,
      `Preserve tone, pacing cues, and line breaks. Keep the same array length.`,
      `Return ONLY a JSON array of translated strings, nothing else.`,
    ].join(" ");

    const response = await this.httpFetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(texts) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI translation error: ${response.status}`);
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? "[]";

    try {
      const parsed: unknown = JSON.parse(content);
      // Model may return { translations: [...] } or a bare array
      if (Array.isArray(parsed)) return parsed as string[];
      const obj = parsed as Record<string, unknown>;
      const first = Object.values(obj)[0];
      if (Array.isArray(first)) return first as string[];
    } catch {
      logger.warn({ content }, "Failed to parse translation JSON; falling back to originals");
    }
    return texts;
  }

  private async getApiKey(): Promise<string> {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    return (await this.settings.getPlaintext("integrations.openaiKey")) ?? "";
  }
}

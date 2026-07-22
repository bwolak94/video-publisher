import { Injectable } from "@nestjs/common";
import pino from "pino";

const logger = pino({ level: "info" });

export interface ThumbnailValidationResult {
  passed: boolean;
  /** GPT-4o explanation of what was/wasn't readable */
  feedback: string;
  /** Legibility score 0-100 (100 = all text clearly readable at thumbnail size) */
  legibilityScore: number;
}

/**
 * F3: Validates a thumbnail image for text legibility at YouTube's preview size
 * (~168×94 px in search results).
 *
 * Sends the image to GPT-4o vision with instructions to evaluate text
 * readability as if viewing a 168px-wide thumbnail — no local Tesseract dependency.
 */
@Injectable()
export class ThumbnailValidationService {
  private readonly openaiApiKey = process.env.OPENAI_API_KEY;

  /** Validate thumbnail at S3 URL. Resolves even on API errors (degrades to passed=true). */
  async validate(
    imageUrl: string,
    projectId: string,
  ): Promise<ThumbnailValidationResult> {
    if (!this.openaiApiKey) {
      logger.warn({ projectId }, "F3: OPENAI_API_KEY not set — skipping thumbnail validation");
      return { passed: true, feedback: "Validation skipped (no API key)", legibilityScore: 100 };
    }

    try {
      const result = await this.callVisionApi(imageUrl);
      logger.info({ projectId, imageUrl, score: result.legibilityScore }, "F3: Thumbnail validated");
      return result;
    } catch (err: any) {
      logger.warn({ projectId, err: err.message }, "F3: Thumbnail validation failed (non-blocking)");
      return { passed: true, feedback: "Validation unavailable", legibilityScore: 100 };
    }
  }

  private async callVisionApi(imageUrl: string): Promise<ThumbnailValidationResult> {
    const systemPrompt =
      "You are a YouTube thumbnail quality analyst. Evaluate whether text overlaid on " +
      "the thumbnail is legible when the image is displayed at 168 pixels wide (YouTube " +
      "search-result thumbnail size). Return ONLY valid JSON, no markdown, no explanation.";

    const userPrompt =
      "Analyse this thumbnail image as if it were 168px wide. " +
      "Return JSON with exactly these keys:\n" +
      '  "legibilityScore": integer 0-100 (100 = all text perfectly readable at thumbnail size)\n' +
      '  "feedback": one sentence describing what text is/isn\'t readable and why\n' +
      '  "passed": boolean (true if legibilityScore >= 60)\n\n' +
      "Return ONLY: {\"legibilityScore\":...,\"feedback\":\"...\",\"passed\":true/false}";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 200,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI vision API returned ${response.status}`);
    }

    const json = await response.json() as any;
    const raw: string = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.trim());

    return {
      passed: Boolean(parsed.passed),
      feedback: String(parsed.feedback ?? ""),
      legibilityScore: Number(parsed.legibilityScore ?? 0),
    };
  }
}

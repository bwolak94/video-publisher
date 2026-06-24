import { Injectable, Inject } from "@nestjs/common";
import pino from "pino";

const logger = pino({ level: "info" });

// Configurable blocklist — keywords that trigger reformulation before DALL-E submission
const BLOCKLIST = [
  "violence", "violent", "blood", "gore", "weapon", "weapons",
  "explosion", "explode", "bomb",
  "nude", "naked", "sexual", "explicit", "pornographic",
  "death", "dead", "kill", "murder", "terrorist", "terrorism",
];

export const OPENAI_HTTP = Symbol("OPENAI_HTTP");

@Injectable()
export class PromptSafetyService {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(@Inject(OPENAI_HTTP) private readonly httpFetch: typeof fetch) {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com";
  }

  /**
   * Returns true if the prompt contains any blocklisted keyword.
   */
  containsBlocklistedKeyword(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return BLOCKLIST.some((word) => lower.includes(word));
  }

  /**
   * Reformulates a policy-violating prompt via GPT-4o-mini.
   * Returns a safe equivalent prompt.
   */
  protected async reformulate(prompt: string): Promise<string> {
    const response = await this.httpFetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Rewrite the following image prompt to be safe for DALL-E 3 content policy. " +
              "Keep the visual meaning but replace any violent, explicit, or policy-violating language " +
              "with safe cinematic equivalents. Output only the rewritten prompt, nothing else.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Prompt reformulation failed: ${response.status}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content.trim() as string;
  }

  /**
   * Returns a safe prompt — reformulates if blocklist hit, otherwise returns as-is.
   */
  async safePrompt(prompt: string): Promise<string> {
    if (!this.containsBlocklistedKeyword(prompt)) {
      return prompt;
    }

    const reformulated = await this.reformulate(prompt);
    logger.info(
      { event: "prompt_reformulated", original: prompt, reformulated },
      "Prompt reformulated for DALL-E safety"
    );
    return reformulated;
  }
}

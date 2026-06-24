/**
 * Simple keyword extractor for Pexels search queries.
 * Strips stop words and cinematography adjectives; returns noun phrases.
 * Rule: no LLM — pure string processing (TASK-10 Rule #4).
 */

const STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "of", "and", "or", "but", "not",
  "is", "are", "was", "were", "be", "been", "being", "with", "this", "that",
  "these", "those", "to", "from", "by", "as", "into", "through", "during",
  "very", "slowly", "quickly", "up", "down", "over", "under", "above", "below",
  // Cinematography descriptors that rarely match stock footage keywords
  "close", "wide", "shot", "view", "angle", "scene", "tight", "extreme",
  "showing", "shows", "shown", "captured", "depicting", "featuring",
  "cinematic", "dramatic", "beautiful", "stunning", "vibrant", "dark", "bright",
  "dynamic", "slow", "motion", "blurred", "bokeh", "aerial", "overhead",
]);

/**
 * Extract search keywords from a visual prompt.
 * @param visualPrompt - e.g. "Close-up of stock market graph falling rapidly"
 * @param maxKeywords  - max number of words to return (default: 5)
 * @returns space-joined keyword string, e.g. "stock market graph falling"
 */
export function extractKeywords(visualPrompt: string, maxKeywords = 5): string {
  const words = visualPrompt
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const unique = [...new Set(words)];
  return unique.slice(0, maxKeywords).join(" ");
}

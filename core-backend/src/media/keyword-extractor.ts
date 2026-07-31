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
 * Named people and fictional characters that Pexels won't have.
 * Replaced with generic context synonyms so searches still yield relevant b-roll.
 */
const NAMED_ENTITY_MAP: Record<string, string> = {
  trump: "politician",
  biden: "politician",
  obama: "politician",
  clinton: "politician",
  elon: "entrepreneur",
  musk: "entrepreneur",
  bezos: "businessman",
  zuckerberg: "tech ceo",
  harry: "student",
  potter: "magic",
  hermione: "student",
  voldemort: "villain",
  gandalf: "wizard",
  batman: "superhero",
  superman: "superhero",
  spiderman: "superhero",
  ironman: "superhero",
};

/**
 * Extract search keywords from a visual prompt.
 * Named public figures and fictional characters are replaced with generic
 * context synonyms so Pexels can still return relevant b-roll.
 *
 * @param visualPrompt - e.g. "Close-up of stock market graph falling rapidly"
 * @param maxKeywords  - max number of words to return (default: 5)
 * @returns space-joined keyword string, e.g. "stock market graph falling"
 */
export function extractKeywords(visualPrompt: string, maxKeywords = 5): string {
  // Replace named entities first (before lower-casing and splitting)
  let normalized = visualPrompt.toLowerCase().replace(/[^a-z\s]/g, " ");
  for (const [entity, replacement] of Object.entries(NAMED_ENTITY_MAP)) {
    normalized = normalized.replace(new RegExp(`\\b${entity}\\b`, "g"), replacement);
  }

  const words = normalized
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  const unique = [...new Set(words)];
  return unique.slice(0, maxKeywords).join(" ");
}

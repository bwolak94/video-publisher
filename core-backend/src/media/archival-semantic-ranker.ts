/**
 * Semantic ranker for archival footage results (FEATURE-02).
 *
 * Uses Jaccard similarity over tokenized title / prompt text.
 * No LLM required — pure string processing.
 */

import type { ArchivalFootageResult } from "./archival-footage.types";

// Shared stop-word list (mirrors keyword-extractor.ts)
const STOP_WORDS = new Set([
  "a", "an", "the", "in", "on", "at", "for", "of", "and", "or", "but", "not",
  "is", "are", "was", "were", "be", "been", "being", "with", "this", "that",
  "these", "those", "to", "from", "by", "as", "into", "through", "during",
  "very", "slowly", "quickly", "up", "down", "over", "under", "above", "below",
  "close", "wide", "shot", "view", "angle", "scene", "tight", "extreme",
  "showing", "shows", "shown", "captured", "depicting", "featuring",
  "cinematic", "dramatic", "beautiful", "stunning", "vibrant", "dark", "bright",
  "dynamic", "slow", "motion", "blurred", "bokeh", "aerial", "overhead",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize++;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

/**
 * Score each result against `visualPrompt`, sort descending, return top `topN`.
 * Mutates `relevanceScore` on each returned result.
 */
export function rankResults(
  results: ArchivalFootageResult[],
  visualPrompt: string,
  topN = 5
): ArchivalFootageResult[] {
  const promptTokens = tokenize(visualPrompt);

  return results
    .map((r) => ({
      ...r,
      relevanceScore: jaccardSimilarity(promptTokens, tokenize(r.title)),
    }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topN);
}

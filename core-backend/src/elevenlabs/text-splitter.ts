/**
 * Split narration text at sentence boundaries when it exceeds ElevenLabs' 5000-char limit.
 * TASK-09 Rule #6.
 */
const MAX_CHARS = 5000;
const SENTENCE_ENDINGS = /(?<=[.!?])\s+/;

export function splitAtSentenceBoundary(text: string, maxChars = MAX_CHARS): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const sentences = text.split(SENTENCE_ENDINGS);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? current + " " + sentence : sentence;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());
      // Single sentence longer than limit — force split at word boundary
      if (sentence.length > maxChars) {
        const words = sentence.split(" ");
        current = "";
        for (const word of words) {
          const next = current ? current + " " + word : word;
          if (next.length <= maxChars) {
            current = next;
          } else {
            if (current) chunks.push(current.trim());
            current = word;
          }
        }
      } else {
        current = sentence;
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter(Boolean);
}

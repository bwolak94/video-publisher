/**
 * Unit test for text splitter — UT-09-06
 */
import { splitAtSentenceBoundary } from "./text-splitter";

describe("splitAtSentenceBoundary — UT-09-06", () => {
  it("text <= 5000 chars → returned as single chunk", () => {
    const text = "Short text.";
    expect(splitAtSentenceBoundary(text)).toEqual(["Short text."]);
  });

  // UT-09-06: text > 5001 chars → split into ≥ 2 segments
  it("UT-09-06: 5001+ char text is split at sentence boundaries", () => {
    // Build a text that's 6200 chars total
    const sentence = "The market declined significantly. ";
    let text = "";
    while (text.length < 6200) text += sentence;
    text = text.trimEnd();

    const chunks = splitAtSentenceBoundary(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(5000);
    }
    // All content preserved (joined chunks should equal original text)
    const joined = chunks.join(" ");
    expect(joined.replace(/\s+/g, " ").trim()).toBe(text.replace(/\s+/g, " ").trim());
  });

  it("exactly 5000 chars → single chunk", () => {
    const text = "A".repeat(4999) + ".";
    expect(splitAtSentenceBoundary(text)).toHaveLength(1);
  });

  it("5001 chars → splits into 2", () => {
    const sentence1 = "A".repeat(4000) + ".";
    const sentence2 = " " + "B".repeat(1001) + ".";
    const text = sentence1 + sentence2;
    expect(text.length).toBeGreaterThan(5000);
    const chunks = splitAtSentenceBoundary(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

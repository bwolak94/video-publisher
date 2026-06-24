import { extractKeywords } from "./keyword-extractor";

describe("extractKeywords", () => {
  it("strips stop words and cinematography descriptors", () => {
    const result = extractKeywords("Close-up of stock market graph falling rapidly");
    // "close" and "shot" are stop words; meaningful words remain
    expect(result).not.toContain("close");
    expect(result).toContain("stock");
    expect(result).toContain("market");
  });

  it("returns at most maxKeywords words", () => {
    const prompt = "futuristic city skyline drone aerial view neon lights reflecting water";
    const result = extractKeywords(prompt, 3);
    expect(result.split(" ").length).toBeLessThanOrEqual(3);
  });

  it("returns empty string for prompts made entirely of stop words", () => {
    const result = extractKeywords("a the and or but");
    expect(result).toBe("");
  });

  it("deduplicates repeated words", () => {
    const result = extractKeywords("market crash market crash");
    const words = result.split(" ");
    const unique = new Set(words);
    expect(words.length).toBe(unique.size);
  });
});

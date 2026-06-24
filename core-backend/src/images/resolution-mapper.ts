/**
 * Maps storyboard aspect ratio to DALL-E 3 size parameter.
 * DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792.
 * Rule: 9:16 → 1024x1792, 16:9 → 1792x1024, 1:1 → 1024x1024.
 */

export type DallESize = "1024x1024" | "1792x1024" | "1024x1792";

const SIZE_MAP: Record<string, DallESize> = {
  "9:16": "1024x1792",
  "16:9": "1792x1024",
  "1:1":  "1024x1024",
};

export function mapAspectRatioToSize(aspectRatio: string): DallESize {
  return SIZE_MAP[aspectRatio] ?? "1792x1024";
}

export function sizeToWidthHeight(size: DallESize): { width: number; height: number } {
  const [w, h] = size.split("x").map(Number);
  return { width: w, height: h };
}

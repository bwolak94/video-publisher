/**
 * Unit tests for file-validator — UT-16-01..03
 */
import { validateFile } from "@/lib/file-validator";

function makeFile(name: string, sizeBytes: number): File {
  const blob = new Blob(["x".repeat(sizeBytes)]);
  return new File([blob], name);
}

describe("validateFile", () => {
  // UT-16-01: valid PDF 5MB → { valid: true }
  it("accepts a valid PDF under 10MB (UT-16-01)", () => {
    const file = makeFile("document.pdf", 5 * 1024 * 1024);
    expect(validateFile(file)).toEqual({ valid: true });
  });

  // UT-16-02: PDF 11MB → { valid: false, error: "File exceeds 10MB" }
  it("rejects a PDF over 10MB (UT-16-02)", () => {
    const file = makeFile("large.pdf", 11 * 1024 * 1024);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("File exceeds 10MB");
  });

  // UT-16-03: .exe file → { valid: false, error: "File type not allowed" }
  it("rejects a disallowed file type (UT-16-03)", () => {
    const file = makeFile("virus.exe", 100);
    const result = validateFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("File type not allowed");
  });

  it("accepts .txt file", () => {
    expect(validateFile(makeFile("notes.txt", 1024))).toEqual({ valid: true });
  });

  it("accepts .md file", () => {
    expect(validateFile(makeFile("readme.md", 1024))).toEqual({ valid: true });
  });

  it("accepts .jpg file", () => {
    expect(validateFile(makeFile("photo.jpg", 2 * 1024 * 1024))).toEqual({ valid: true });
  });

  it("accepts .png file", () => {
    expect(validateFile(makeFile("image.png", 1024))).toEqual({ valid: true });
  });

  it("rejects .mp4 file type", () => {
    const result = validateFile(makeFile("video.mp4", 100));
    expect(result.valid).toBe(false);
    expect(result.error).toBe("File type not allowed");
  });
});

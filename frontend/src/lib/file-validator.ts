const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (NFR-8.4)

const ALLOWED_EXTENSIONS = new Set([".txt", ".pdf", ".md", ".jpg", ".jpeg", ".png"]);

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): ValidationResult {
  const ext = "." + file.name.split(".").pop()?.toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: "File type not allowed" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File exceeds 10MB" };
  }

  return { valid: true };
}

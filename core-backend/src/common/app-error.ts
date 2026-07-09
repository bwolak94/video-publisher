/**
 * I4: Structured error codes.
 *
 * Use AppError instead of bare Error so the frontend can branch on `code`
 * rather than parsing human-readable `message` strings.
 */

export type AppErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "CIRCUIT_OPEN"
  | "BUDGET_EXCEEDED"
  | "BUDGET_PAUSED"
  | "ASSET_GENERATION_FAILED"
  | "RENDER_FAILED"
  | "VALIDATION_FAILED"
  | "CACHE_MISS"
  | "S3_ERROR"
  | "AI_BACKEND_UNAVAILABLE"
  | "VOICE_CLONE_FAILED"
  | "PUBLISH_FAILED"
  | "QUOTA_EXCEEDED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

/** Narrow an unknown thrown value to AppError, or wrap it in one. */
export function toAppError(err: unknown, fallbackCode: AppErrorCode = "INTERNAL"): AppError {
  if (err instanceof AppError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new AppError(fallbackCode, msg, err);
}

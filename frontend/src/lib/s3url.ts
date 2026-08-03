/**
 * Converts an s3://bucket/key URL to a publicly accessible HTTP URL via MinIO.
 * Falls back to the original URL if it's already an HTTP(S) URL or if env vars are missing.
 */
const MINIO_URL = process.env.NEXT_PUBLIC_MINIO_URL ?? "http://localhost:9000";
const S3_BUCKET = process.env.NEXT_PUBLIC_S3_BUCKET ?? "video-publisher-assets";

export function s3ToHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("s3://")) {
    // s3://bucket/path/to/key → http://minio:9000/bucket/path/to/key
    const withoutScheme = url.slice("s3://".length);
    const slashIdx = withoutScheme.indexOf("/");
    if (slashIdx === -1) return null;
    const bucket = withoutScheme.slice(0, slashIdx);
    const key = withoutScheme.slice(slashIdx + 1);
    return `${MINIO_URL}/${bucket}/${key}`;
  }
  // bare key like "audio/abc.mp3"
  return `${MINIO_URL}/${S3_BUCKET}/${url}`;
}

-- Migration: Subtitle Cache (FEATURE-04)
-- Stores word-level timestamps and SRT/VTT S3 URLs per audio file hash

CREATE TABLE IF NOT EXISTS "subtitle_cache" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "audio_hash"  TEXT        NOT NULL,
  "words"       JSONB       NOT NULL DEFAULT '[]',
  "language"    TEXT        NOT NULL DEFAULT 'en',
  "srt_s3_url"  TEXT        NOT NULL,
  "vtt_s3_url"  TEXT        NOT NULL,
  "provider"    TEXT        NOT NULL,
  "created_at"  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "subtitle_cache_audio_hash_idx"
  ON "subtitle_cache" ("audio_hash");

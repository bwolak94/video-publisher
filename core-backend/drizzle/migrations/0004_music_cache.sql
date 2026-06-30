-- Migration 0004: music_cache table for FEATURE-03

CREATE TABLE IF NOT EXISTS "music_cache" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "params_hash"      TEXT NOT NULL,
  "s3_url"           TEXT NOT NULL,
  "provider"         TEXT NOT NULL,
  "mood"             TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "artist"           TEXT,
  "license"          TEXT NOT NULL DEFAULT 'CC-BY',
  "duration_seconds" NUMERIC(10, 2) NOT NULL,
  "created_at"       TIMESTAMPTZ DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "music_cache_params_hash_idx" ON "music_cache" ("params_hash");

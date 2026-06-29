-- Migration: Multi-Provider Video Generation (FEATURE-01)
-- Adds archival_footage_cache table for caching free footage search results

CREATE TABLE IF NOT EXISTS "archival_footage_cache" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "prompt_hash" CHAR(64) NOT NULL,
  "keywords"    TEXT NOT NULL,
  "s3_url"      TEXT NOT NULL,
  "source"      TEXT NOT NULL,   -- 'archive.org' | 'wikimedia' | 'nasa'
  "title"       TEXT,
  "created_at"  TIMESTAMPTZ DEFAULT NOW(),
  "expires_at"  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE UNIQUE INDEX IF NOT EXISTS "archival_footage_cache_prompt_hash_idx"
  ON "archival_footage_cache" ("prompt_hash");

CREATE INDEX IF NOT EXISTS "archival_footage_cache_expires_idx"
  ON "archival_footage_cache" ("expires_at");

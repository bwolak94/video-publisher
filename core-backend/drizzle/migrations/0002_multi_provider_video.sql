-- Migration: Multi-Provider Video + Archival Footage Pipeline (FEATURE-01 + FEATURE-02)
-- Creates archival_footage_cache table for caching semantic search results + downloaded S3 URLs

CREATE TABLE IF NOT EXISTS "archival_footage_cache" (
  "id"          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "prompt_hash" TEXT        NOT NULL,
  "results"     JSONB       NOT NULL DEFAULT '[]',
  "s3_url"      TEXT,
  "created_at"  TIMESTAMPTZ DEFAULT NOW(),
  "expires_at"  TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "archival_footage_cache_prompt_hash_idx"
  ON "archival_footage_cache" ("prompt_hash");

CREATE INDEX IF NOT EXISTS "archival_footage_cache_expires_idx"
  ON "archival_footage_cache" ("expires_at");

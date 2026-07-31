-- Migration 0016: Visual Consistency System — entities table (P1)

CREATE TABLE IF NOT EXISTS "entities" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id"           UUID NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name"                 TEXT NOT NULL,
  "type"                 TEXT NOT NULL,
  "description"          TEXT,
  "reference_image_urls" JSONB DEFAULT '[]',
  "created_at"           TIMESTAMPTZ DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_entities_project_id" ON "entities"("project_id");

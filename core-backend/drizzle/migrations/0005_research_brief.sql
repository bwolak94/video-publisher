-- Migration 0005: Add research_brief columns to projects (FEATURE-05)

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "research_brief"        JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "research_completed_at" TIMESTAMPTZ DEFAULT NULL;

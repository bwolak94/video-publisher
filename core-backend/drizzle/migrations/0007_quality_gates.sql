-- Migration 0007: Add quality gate columns to projects (FEATURE-07)

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "pre_render_validation" JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "post_render_quality"   JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "render_quality_score"  NUMERIC(3, 2) DEFAULT NULL;

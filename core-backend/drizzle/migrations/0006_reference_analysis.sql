-- Migration 0006: Add reference video analysis columns to projects (FEATURE-06)

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "reference_video_url" TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS "reference_analysis"  JSONB DEFAULT NULL;

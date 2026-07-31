-- S3: Add approved_reference_image_url column for visual conditioning in generation pipeline
-- S7: type column already accepts text; "costume" is now a valid value at application level

ALTER TABLE "entities"
  ADD COLUMN IF NOT EXISTS "approved_reference_image_url" TEXT;

COMMENT ON COLUMN "entities"."approved_reference_image_url"
  IS 'S3: The approved reference image URL used as image conditioning input during video/image generation. Set via PATCH /api/projects/:projectId/entities/:id/approve-reference';

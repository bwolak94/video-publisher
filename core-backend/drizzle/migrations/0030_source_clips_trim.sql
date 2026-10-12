ALTER TABLE source_clips
  ADD COLUMN IF NOT EXISTS in_point_s  numeric(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS out_point_s numeric(8,2);

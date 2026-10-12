-- FIX-03: Add manual QA status column to scene_clips
-- Allows human operators to approve or reject QA results via the UI.
-- Rejected scenes are re-enqueued for I2V generation (attempt + 1).

ALTER TABLE scene_clips
  ADD COLUMN IF NOT EXISTS manual_qa_status text
    CHECK (manual_qa_status IN ('approved', 'rejected'));

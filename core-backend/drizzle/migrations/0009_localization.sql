-- FEATURE-10: Localization & Dubbing Pipeline
-- Adds parent/child project relationship and language tracking to projects table.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS language          TEXT    DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS is_localization   BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id ON projects (parent_project_id);

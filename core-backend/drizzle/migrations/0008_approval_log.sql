-- FEATURE-09: Per-Action Budget Approval & Cost Estimation

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS total_spent_usd NUMERIC(10,4) DEFAULT 0.0000;

CREATE TABLE IF NOT EXISTS approval_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_id       TEXT,
  action         TEXT NOT NULL,
  provider       TEXT NOT NULL,
  estimated_cost NUMERIC(8,4),
  actual_cost    NUMERIC(8,4),
  approved_by    TEXT,
  decision       TEXT NOT NULL,
  decided_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_log_project_id ON approval_log (project_id);

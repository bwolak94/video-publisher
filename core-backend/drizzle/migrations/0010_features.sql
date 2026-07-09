-- I05: Per-project cost budget column
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_budget_usd NUMERIC(10, 2) DEFAULT 0;

-- F04: Brand kits table
CREATE TABLE IF NOT EXISTS brand_kits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  logo_url          TEXT,
  primary_color     TEXT DEFAULT '#ffffff',
  secondary_color   TEXT DEFAULT '#000000',
  font_family       TEXT DEFAULT 'Inter',
  lower_third_style JSONB DEFAULT '{}',
  intro_clip_s3_url TEXT,
  outro_clip_s3_url TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- F05: Publish analytics snapshots table
CREATE TABLE IF NOT EXISTS publish_analytics_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id               UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform                 TEXT NOT NULL,
  platform_video_id        TEXT NOT NULL,
  snapshot_type            TEXT NOT NULL,  -- '24h' | '72h' | '7d'
  views                    TEXT DEFAULT '0',
  likes                    TEXT DEFAULT '0',
  comments                 TEXT DEFAULT '0',
  impression_ctr           NUMERIC(6, 4),
  avg_view_duration_seconds TEXT,
  retention_pct            NUMERIC(5, 2),
  captured_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pub_analytics_project
  ON publish_analytics_snapshots (project_id);

CREATE INDEX IF NOT EXISTS idx_pub_analytics_snap_type
  ON publish_analytics_snapshots (snapshot_type);

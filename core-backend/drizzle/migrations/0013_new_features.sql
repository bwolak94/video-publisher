-- F3: Collaborative review sessions
CREATE TABLE IF NOT EXISTS review_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token       TEXT        UNIQUE NOT NULL,
  label       TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- F3: Scene-level comments from reviewers
CREATE TABLE IF NOT EXISTS scene_comments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_session_id  UUID        NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  scene_id           TEXT        NOT NULL,
  author_name        TEXT        NOT NULL DEFAULT 'Anonymous',
  body               TEXT        NOT NULL,
  reaction           TEXT,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_comments_session
  ON scene_comments (review_session_id);

-- F5: Project storyboard version snapshots
CREATE TABLE IF NOT EXISTS project_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storyboard  JSONB       NOT NULL,
  label       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project
  ON project_versions (project_id);

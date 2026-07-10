-- I6: Scene asset URL history (tracks previous video/audio URLs before overwrite)
CREATE TABLE IF NOT EXISTS scene_asset_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID        REFERENCES projects(id) ON DELETE CASCADE,
  scene_id     TEXT        NOT NULL,
  field        TEXT        NOT NULL,
  previous_url TEXT        NOT NULL,
  replaced_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_asset_history_scene
  ON scene_asset_history (project_id, scene_id);

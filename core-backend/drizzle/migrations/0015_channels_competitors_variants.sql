-- Migration 0015: Multi-channel workspace (F2), Competitor gap analysis (F4),
--                 Narration A/B variants (F5)

-- ── F2: channels ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  niche_profile      JSONB DEFAULT '{}',
  youtube_channel_id TEXT,
  tiktok_username    TEXT,
  instagram_username TEXT,
  brand_kit_id       UUID REFERENCES brand_kits(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_user_id ON channels (user_id);

-- ── F4: competitor tracking ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS competitor_channels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL DEFAULT 'youtube',
  channel_id       TEXT NOT NULL,
  channel_name     TEXT,
  last_analyzed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_channels_user ON competitor_channels (user_id);

CREATE TABLE IF NOT EXISTS competitor_videos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_channel_id UUID NOT NULL REFERENCES competitor_channels(id) ON DELETE CASCADE,
  platform_video_id     TEXT NOT NULL,
  title                 TEXT NOT NULL,
  view_count            TEXT DEFAULT '0',
  like_count            TEXT DEFAULT '0',
  published_at          TIMESTAMPTZ,
  fetched_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_videos_channel ON competitor_videos (competitor_channel_id);

-- Prevent duplicate video rows per competitor channel
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_videos_unique
  ON competitor_videos (competitor_channel_id, platform_video_id);

CREATE TABLE IF NOT EXISTS competitor_gap_analyses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insights    JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_analyses_user ON competitor_gap_analyses (user_id);

-- ── F5: narration A/B variants ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS narration_variants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id             TEXT NOT NULL,
  variant_key          TEXT NOT NULL,          -- 'a' | 'b'
  audio_s3_url         TEXT NOT NULL,
  voice_id             TEXT,
  script_text          TEXT,
  platform_variant_id  TEXT,
  status               TEXT DEFAULT 'pending', -- pending | running | promoted | rejected
  views                TEXT DEFAULT '0',
  avg_view_duration_pct NUMERIC(5, 2),
  promoted_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_narration_variants_project
  ON narration_variants (project_id, scene_id);

-- Enforce one variant per (project_id, scene_id, variant_key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_narration_variants_unique
  ON narration_variants (project_id, scene_id, variant_key);

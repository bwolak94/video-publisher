-- I1: Add expires_at TTL column to music_cache for stale-while-revalidate refresh
ALTER TABLE music_cache ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- I8: Persisted ElevenLabs instant voice clones — reusable across projects
CREATE TABLE IF NOT EXISTS cloned_voices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id) ON DELETE CASCADE,
  voice_id        TEXT        NOT NULL,
  voice_name      TEXT        NOT NULL,
  source_video_url TEXT,
  provider        TEXT        NOT NULL DEFAULT 'elevenlabs',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloned_voices_user_id ON cloned_voices(user_id);

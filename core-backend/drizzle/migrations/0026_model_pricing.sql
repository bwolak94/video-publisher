CREATE TABLE IF NOT EXISTS model_pricing (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  model text not null,
  endpoint text not null,
  price_per_unit numeric(10,6) not null,
  unit text not null,
  license text default 'commercial',
  is_active boolean default true,
  tag text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Seed data
INSERT INTO model_pricing (role, model, endpoint, price_per_unit, unit, license, tag) VALUES
  ('i2v-default', 'wan-2.5', 'fal-ai/wan/image-to-video', 0.050000, 'per_second', 'commercial', 'landscape'),
  ('i2v-action', 'kling-2.5-turbo-pro', 'fal-ai/kling-video/v2.1/pro/image-to-video', 0.070000, 'per_second', 'commercial', 'action'),
  ('t2i', 'flux-dev', 'fal-ai/flux/dev', 0.040000, 'per_image', 'check', null),
  ('tts', 'eleven-multilingual-v2', 'api.elevenlabs.io/v1/text-to-speech', 0.000625, 'per_1k_chars', 'commercial', null),
  ('render', 'remotion-lambda', 'remotionlambda.amazonaws.com', 0.020000, 'per_render', 'commercial', null),
  ('qa', 'claude-3-5-haiku', 'api.anthropic.com/v1/messages', 0.001000, 'per_render', 'commercial', null),
  ('lipsync', 'wav2lip', 'fal-ai/wav2lip', 0.050000, 'per_second', 'check', 'dialog'),
  ('v2v', 'wan-2.5-v2v', 'fal-ai/wan/video-to-video', 0.060000, 'per_second', 'commercial', null),
  ('llm-outline', 'claude-sonnet-4-6', 'api.anthropic.com/v1/messages', 0.003000, 'per_render', 'commercial', null)
ON CONFLICT DO NOTHING;

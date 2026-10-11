CREATE TABLE IF NOT EXISTS source_clips (
  id uuid primary key default gen_random_uuid(),
  name text,
  s3_url text not null,
  duration_s numeric(8,2),
  fps numeric(5,2),
  resolution text,
  created_at timestamptz default now()
);

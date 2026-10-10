CREATE TABLE IF NOT EXISTS scene_keyframes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references shorts_jobs(id) on delete cascade,
  scene_id text not null,
  variant_index integer not null,
  s3_url text not null,
  seed bigint,
  similarity numeric(4,3),
  accepted boolean default false,
  created_at timestamptz default now()
);

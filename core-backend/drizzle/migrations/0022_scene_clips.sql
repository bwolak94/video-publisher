CREATE TABLE IF NOT EXISTS scene_clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references shorts_jobs(id) on delete cascade,
  scene_id text not null,
  keyframe_id uuid references scene_keyframes(id),
  s3_url text not null,
  provider text not null default 'fal-ai',
  model text not null default 'wan-2.5',
  seed bigint,
  attempt integer default 1,
  qa_score numeric(4,3),
  qa_checks jsonb,
  qa_passed boolean default false,
  created_at timestamptz default now()
);

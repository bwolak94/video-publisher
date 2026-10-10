CREATE TABLE IF NOT EXISTS shorts_jobs (
  id uuid primary key default gen_random_uuid(),
  brief text not null,
  niche_id uuid,
  character_ids uuid[] default '{}',
  budget_usd numeric(8,2) default 4.00,
  duration_s integer not null,
  shot_track text not null,
  hitl boolean default true,
  scene_plan jsonb,
  status text not null default 'plan_ready',
  moderation_blocked boolean default false,
  created_at timestamptz default now()
);

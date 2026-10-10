-- Migration 0020: Character Bible — characters and character_images tables

CREATE TABLE IF NOT EXISTS characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  style text default 'realistic',
  voice_id text,
  niche_profile_id uuid,
  consent_type text default 'original',
  likeness_consent_id uuid,
  version integer default 1,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS character_images (
  id uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  s3_url text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

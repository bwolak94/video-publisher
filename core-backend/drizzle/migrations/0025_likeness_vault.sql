CREATE TABLE IF NOT EXISTS likeness_invitations (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  operator_id uuid,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now()
);

CREATE TABLE IF NOT EXISTS likeness_consents (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid references likeness_invitations(id),
  subject_name text not null,
  subject_email text not null,
  photos_s3_keys text[] not null,
  liveness_s3_key text not null,
  face_match_score numeric(4,3) not null,
  purpose text not null,
  channels text[] not null,
  topics_allowed text[] not null,
  voice_consent boolean default false,
  period_until timestamptz,
  proof_hash text not null,
  proof_ip_hash text not null,
  proof_at timestamptz not null,
  revoked_at timestamptz,
  deletion_scheduled_at timestamptz,
  version integer default 1,
  created_at timestamptz default now()
);

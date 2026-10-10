CREATE TABLE IF NOT EXISTS sfx_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tags text[] default '{}',
  s3_url text not null,
  duration_s numeric(5,2),
  license text default 'cc0',
  created_at timestamptz default now()
);

INSERT INTO sfx_library (name, tags, s3_url, duration_s, license) VALUES
  ('Whoosh Fast', '{whoosh,movement,transition}', 's3://sfx/whoosh-fast.mp3', 0.50, 'cc0'),
  ('Impact Heavy', '{impact,hit,punch}', 's3://sfx/impact-heavy.mp3', 0.80, 'cc0'),
  ('Door Creak', '{ambient,door,creak}', 's3://sfx/door-creak.mp3', 1.20, 'cc0'),
  ('Crowd Cheer', '{crowd,cheer,energy}', 's3://sfx/crowd-cheer.mp3', 3.50, 'cc0'),
  ('Thunder Clap', '{thunder,weather,dramatic}', 's3://sfx/thunder-clap.mp3', 2.10, 'cc0'),
  ('Cash Register', '{money,cash,purchase}', 's3://sfx/cash-register.mp3', 0.90, 'cc0'),
  ('Explosion Small', '{explosion,impact,action}', 's3://sfx/explosion-small.mp3', 1.50, 'cc0'),
  ('Bird Chirp', '{nature,bird,ambient}', 's3://sfx/bird-chirp.mp3', 0.70, 'cc0'),
  ('Heartbeat Fast', '{heartbeat,tension,dramatic}', 's3://sfx/heartbeat-fast.mp3', 2.00, 'cc0'),
  ('Glass Break', '{glass,break,crash}', 's3://sfx/glass-break.mp3', 1.10, 'cc0');

CREATE TABLE film_reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references shorts_jobs(id),
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  status text not null default 'pending',
  video_url text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

CREATE INDEX idx_film_reviews_job_id ON film_reviews(job_id);
CREATE INDEX idx_film_reviews_token ON film_reviews(token);

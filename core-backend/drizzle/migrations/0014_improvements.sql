-- I8: Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_delivery_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID        NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event         TEXT        NOT NULL,
  status_code   TEXT,
  response_body TEXT,
  success       BOOLEAN     NOT NULL,
  attempted_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_delivery_log
  ON webhook_delivery_log (webhook_id);

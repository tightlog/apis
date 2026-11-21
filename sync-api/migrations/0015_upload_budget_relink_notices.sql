CREATE TABLE IF NOT EXISTS media_upload_budget (
  day TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_media_objects_created
  ON media_objects(created_at);

ALTER TABLE recovery_notices ADD COLUMN key_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_recovery_notices_key_unread
  ON recovery_notices(key_hash) WHERE read_at IS NULL AND key_hash IS NOT NULL;

ALTER TABLE media_objects ADD COLUMN committed INTEGER NOT NULL DEFAULT 1;

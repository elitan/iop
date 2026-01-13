CREATE TABLE IF NOT EXISTS registries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE services ADD COLUMN registry_id TEXT;

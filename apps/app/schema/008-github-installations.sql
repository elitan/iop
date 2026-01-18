CREATE TABLE github_installations (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'User',
  created_at INTEGER NOT NULL
);

CREATE TABLE database_backup_configs (
  database_id TEXT PRIMARY KEY REFERENCES databases(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  selected_target_ids_json TEXT NOT NULL DEFAULT '[]',
  interval_value INTEGER NOT NULL DEFAULT 6,
  interval_unit TEXT NOT NULL DEFAULT 'hours' CHECK (interval_unit IN ('minutes', 'hours', 'days')),
  retention_days INTEGER NOT NULL DEFAULT 30,
  s3_provider TEXT NOT NULL DEFAULT 'aws' CHECK (s3_provider IN ('aws', 'cloudflare', 'backblaze', 'custom')),
  s3_endpoint TEXT,
  s3_region TEXT,
  s3_bucket TEXT NOT NULL DEFAULT '',
  s3_prefix TEXT NOT NULL DEFAULT '',
  s3_access_key_id TEXT NOT NULL DEFAULT '',
  s3_secret_access_key_encrypted TEXT NOT NULL DEFAULT '',
  s3_force_path_style INTEGER NOT NULL DEFAULT 0 CHECK (s3_force_path_style IN (0, 1)),
  include_globals INTEGER NOT NULL DEFAULT 1 CHECK (include_globals IN (0, 1)),
  running INTEGER NOT NULL DEFAULT 0 CHECK (running IN (0, 1)),
  last_run_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_database_backup_configs_enabled ON database_backup_configs(enabled);

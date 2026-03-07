CREATE TABLE database_import_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  database_id TEXT REFERENCES databases(id) ON DELETE SET NULL,
  target_name TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('postgres')),
  strategy TEXT NOT NULL DEFAULT 'dump-restore' CHECK (strategy IN ('dump-restore', 'logical-replication')),
  source_url_encrypted TEXT,
  source_host TEXT NOT NULL,
  source_port INTEGER NOT NULL,
  source_database TEXT NOT NULL,
  source_username TEXT NOT NULL,
  source_ssl_mode TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (
    stage IN (
      'source',
      'preflight',
      'target',
      'importing',
      'imported',
      'verifying',
      'ready-for-cutover',
      'completed',
      'failed'
    )
  ),
  progress_step TEXT,
  source_summary_json TEXT NOT NULL DEFAULT '{}',
  check_results_json TEXT NOT NULL DEFAULT '[]',
  verify_result_json TEXT NOT NULL DEFAULT '{}',
  log_text TEXT NOT NULL DEFAULT '',
  error_message TEXT,
  cutover_confirmed_at INTEGER,
  completed_at INTEGER,
  failed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_database_import_jobs_project_id ON database_import_jobs(project_id);
CREATE INDEX idx_database_import_jobs_database_id ON database_import_jobs(database_id);

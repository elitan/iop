CREATE TABLE databases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('postgres', 'mysql')),
  provider TEXT NOT NULL CHECK (provider IN ('velo', 'mysql-docker')),
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name)
);

CREATE INDEX idx_databases_project_id ON databases(project_id);

CREATE TABLE database_targets (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('branch', 'instance')),
  source_target_id TEXT REFERENCES database_targets(id) ON DELETE SET NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'stopped', 'expired')),
  expires_at INTEGER,
  provider_ref_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  UNIQUE(database_id, name)
);

CREATE INDEX idx_database_targets_database_id ON database_targets(database_id);
CREATE INDEX idx_database_targets_source_target_id ON database_targets(source_target_id);

CREATE TABLE environment_database_attachments (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES database_targets(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('managed', 'manual')),
  created_at INTEGER NOT NULL,
  UNIQUE(environment_id, database_id)
);

CREATE INDEX idx_env_db_attachments_environment_id ON environment_database_attachments(environment_id);
CREATE INDEX idx_env_db_attachments_target_id ON environment_database_attachments(target_id);

CREATE TABLE service_database_bindings (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  database_id TEXT NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  env_var_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(service_id, env_var_key)
);

CREATE INDEX idx_service_db_bindings_service_id ON service_database_bindings(service_id);
CREATE INDEX idx_service_db_bindings_database_id ON service_database_bindings(database_id);

DELETE FROM services WHERE service_type = 'database';

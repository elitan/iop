ALTER TABLE database_targets ADD COLUMN runtime_service_id TEXT NOT NULL DEFAULT '';

CREATE TABLE database_target_deployments (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES database_targets(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'deploy', 'reset', 'start', 'stop')),
  status TEXT NOT NULL CHECK (status IN ('running', 'failed', 'stopped')),
  message TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX idx_database_target_deployments_target_id ON database_target_deployments(target_id);
CREATE INDEX idx_database_target_deployments_created_at ON database_target_deployments(created_at);

DELETE FROM service_database_bindings;
DELETE FROM environment_database_attachments;
DELETE FROM database_target_deployments;
DELETE FROM database_targets;
DELETE FROM databases;
DELETE FROM services WHERE service_type = 'database';

CREATE UNIQUE INDEX idx_database_targets_runtime_service_id ON database_targets(runtime_service_id);

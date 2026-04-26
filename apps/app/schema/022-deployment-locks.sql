CREATE TABLE deployment_locks (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  claim_token TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);

CREATE INDEX idx_deployment_locks_deployment_id ON deployment_locks(deployment_id);

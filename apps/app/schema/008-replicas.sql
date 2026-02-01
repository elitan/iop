ALTER TABLE services ADD COLUMN replica_count INTEGER NOT NULL DEFAULT 1;

CREATE TABLE replicas (
    id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    replica_index INTEGER NOT NULL,
    container_id TEXT,
    host_port INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(deployment_id, replica_index)
);

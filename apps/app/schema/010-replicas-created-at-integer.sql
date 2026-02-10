CREATE TABLE replicas_new (
    id TEXT PRIMARY KEY,
    deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    replica_index INTEGER NOT NULL,
    container_id TEXT,
    host_port INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
    UNIQUE(deployment_id, replica_index)
);

INSERT INTO replicas_new (
    id,
    deployment_id,
    replica_index,
    container_id,
    host_port,
    status,
    created_at
)
SELECT
    id,
    deployment_id,
    replica_index,
    container_id,
    host_port,
    status,
    CAST(created_at AS INTEGER)
FROM replicas;

DROP TABLE replicas;

ALTER TABLE replicas_new RENAME TO replicas;

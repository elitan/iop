PRAGMA foreign_keys = OFF;

BEGIN EXCLUSIVE;

CREATE TABLE databases_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  engine TEXT NOT NULL CHECK (engine IN ('postgres', 'mysql')),
  provider TEXT NOT NULL CHECK (provider IN ('postgres-docker', 'mysql-docker')),
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name)
);

INSERT INTO databases_new (
  id,
  project_id,
  name,
  engine,
  provider,
  created_at
)
SELECT
  id,
  project_id,
  name,
  engine,
  CASE
    WHEN provider = 'mysql-docker' THEN 'mysql-docker'
    ELSE 'postgres-docker'
  END AS provider,
  created_at
FROM databases;

DROP TABLE databases;

ALTER TABLE databases_new RENAME TO databases;

CREATE INDEX idx_databases_project_id ON databases(project_id);

COMMIT;

PRAGMA foreign_keys = ON;

-- Remove port column from services (now injected as PORT env var, default 8080)
PRAGMA foreign_keys = OFF;

CREATE TABLE services_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deploy_type TEXT NOT NULL DEFAULT 'repo',
  repo_url TEXT,
  branch TEXT DEFAULT 'main',
  dockerfile_path TEXT DEFAULT 'Dockerfile',
  image_url TEXT,
  env_vars TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name)
);

INSERT INTO services_new (id, project_id, name, deploy_type, repo_url, branch, dockerfile_path, image_url, env_vars, created_at)
SELECT id, project_id, name, deploy_type, repo_url, branch, dockerfile_path, image_url, env_vars, created_at
FROM services;

DROP TABLE services;
ALTER TABLE services_new RENAME TO services;

PRAGMA foreign_keys = ON;

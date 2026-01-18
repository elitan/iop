CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  dockerfile_path TEXT NOT NULL DEFAULT 'Dockerfile',
  port INTEGER NOT NULL DEFAULT 3000,
  created_at INTEGER NOT NULL
);

CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  commit_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  container_id TEXT,
  host_port INTEGER,
  build_log TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

-- Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- Create services table (extracted from projects)
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deploy_type TEXT NOT NULL DEFAULT 'repo',
  repo_url TEXT,
  branch TEXT DEFAULT 'main',
  dockerfile_path TEXT DEFAULT 'Dockerfile',
  image_url TEXT,
  port INTEGER NOT NULL DEFAULT 3000,
  env_vars TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name)
);

-- Migrate existing projects to services (1 project = 1 service with same name)
INSERT INTO services (id, project_id, name, deploy_type, repo_url, branch, dockerfile_path, image_url, port, env_vars, created_at)
SELECT
  id || '-svc',
  id,
  name,
  deploy_type,
  repo_url,
  branch,
  dockerfile_path,
  image_url,
  port,
  env_vars,
  created_at
FROM projects;

-- Recreate projects table without service fields (keep env_vars for shared project-level vars)
CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  env_vars TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

INSERT INTO projects_new (id, name, env_vars, created_at)
SELECT id, name, '[]', created_at FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

-- Add service_id to deployments
CREATE TABLE deployments_new (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
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

-- Backfill service_id from project_id
INSERT INTO deployments_new (id, project_id, service_id, commit_sha, commit_message, status, container_id, host_port, build_log, error_message, created_at, finished_at)
SELECT
  id,
  project_id,
  project_id || '-svc',
  commit_sha,
  commit_message,
  status,
  container_id,
  host_port,
  build_log,
  error_message,
  created_at,
  finished_at
FROM deployments;

DROP TABLE deployments;
ALTER TABLE deployments_new RENAME TO deployments;

-- Re-enable foreign keys
PRAGMA foreign_keys = ON;

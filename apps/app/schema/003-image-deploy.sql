-- SQLite doesn't support ALTER COLUMN, so recreate table to make repo fields nullable

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_url TEXT,
  branch TEXT DEFAULT 'main',
  dockerfile_path TEXT DEFAULT 'Dockerfile',
  port INTEGER NOT NULL DEFAULT 3000,
  env_vars TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  deploy_type TEXT NOT NULL DEFAULT 'repo',
  created_at INTEGER NOT NULL
);

INSERT INTO projects_new (id, name, repo_url, branch, dockerfile_path, port, env_vars, created_at)
SELECT id, name, repo_url, branch, dockerfile_path, port, env_vars, created_at FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

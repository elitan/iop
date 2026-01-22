-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT,
  env_vars TEXT NOT NULL DEFAULT '[]',
  canvas_positions TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

-- Environments (production, preview, manual)
CREATE TABLE environments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual' CHECK (type IN ('production', 'preview', 'manual')),
  pr_number INTEGER,
  pr_branch TEXT,
  pr_comment_id INTEGER,
  is_ephemeral INTEGER DEFAULT 0 CHECK (is_ephemeral IN (0, 1)),
  created_at INTEGER NOT NULL,
  UNIQUE(project_id, name)
);

CREATE INDEX idx_environments_project_id ON environments(project_id);
CREATE INDEX idx_environments_branch ON environments(project_id, pr_branch);

-- Services (scoped to environment)
CREATE TABLE services (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hostname TEXT,
  deploy_type TEXT NOT NULL DEFAULT 'repo' CHECK (deploy_type IN ('repo', 'image')),
  service_type TEXT NOT NULL DEFAULT 'app' CHECK (service_type IN ('app', 'database')),
  repo_url TEXT,
  branch TEXT DEFAULT 'main',
  dockerfile_path TEXT DEFAULT 'Dockerfile',
  build_context TEXT,
  image_url TEXT,
  registry_id TEXT,
  env_vars TEXT NOT NULL DEFAULT '[]',
  container_port INTEGER DEFAULT 8080,
  health_check_path TEXT,
  health_check_timeout INTEGER DEFAULT 60,
  auto_deploy INTEGER DEFAULT 1 CHECK (auto_deploy IN (0, 1)),
  volumes TEXT DEFAULT '[]',
  tcp_proxy_port INTEGER,
  memory_limit TEXT,
  cpu_limit REAL,
  shutdown_timeout INTEGER,
  request_timeout INTEGER,
  command TEXT,
  current_deployment_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(environment_id, name)
);

CREATE INDEX idx_services_environment_id ON services(environment_id);

-- Deployments
CREATE TABLE deployments (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  commit_message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cloning', 'pulling', 'building', 'deploying', 'running', 'failed', 'stopped', 'cancelled')),
  container_id TEXT,
  host_port INTEGER,
  build_log TEXT,
  error_message TEXT,
  image_name TEXT,
  env_vars_snapshot TEXT,
  container_port INTEGER,
  health_check_path TEXT,
  health_check_timeout INTEGER,
  volumes TEXT,
  rollback_eligible INTEGER DEFAULT 0 CHECK (rollback_eligible IN (0, 1)),
  rollback_source_id TEXT,
  git_commit_sha TEXT,
  git_branch TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

CREATE INDEX idx_deployments_service_id ON deployments(service_id);
CREATE INDEX idx_deployments_environment_id ON deployments(environment_id);
CREATE INDEX idx_deployments_status ON deployments(status);

-- Domains
CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'proxy' CHECK (type IN ('proxy', 'redirect')),
  redirect_target TEXT,
  redirect_code INTEGER DEFAULT 301 CHECK (redirect_code IN (301, 307)),
  dns_verified INTEGER DEFAULT 0 CHECK (dns_verified IN (0, 1)),
  ssl_status TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
  is_system INTEGER DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at INTEGER NOT NULL,
  CHECK ((type = 'proxy' AND redirect_target IS NULL) OR (type = 'redirect' AND redirect_target IS NOT NULL))
);

CREATE INDEX idx_domains_service_id ON domains(service_id);
CREATE INDEX idx_domains_environment_id ON domains(environment_id);
CREATE INDEX idx_domains_domain ON domains(domain);

-- GitHub Installations
CREATE TABLE github_installations (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'User' CHECK (account_type IN ('User', 'Organization')),
  created_at INTEGER NOT NULL
);

-- Container Registries
CREATE TABLE registries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Metrics
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL,
  container_id TEXT,
  service_id TEXT,
  cpu_percent REAL NOT NULL,
  memory_percent REAL NOT NULL,
  memory_bytes INTEGER,
  network_rx INTEGER,
  network_tx INTEGER,
  disk_percent REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_metrics_timestamp ON metrics(timestamp);
CREATE INDEX idx_metrics_type ON metrics(type);

-- API Keys
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- Settings (key-value store)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

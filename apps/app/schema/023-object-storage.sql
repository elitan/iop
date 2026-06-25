PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_services_environment_id;
DROP INDEX IF EXISTS idx_services_environment_hostname;

CREATE TABLE services_new (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hostname TEXT,
  deploy_type TEXT NOT NULL DEFAULT 'repo' CHECK (deploy_type IN ('repo', 'image')),
  service_type TEXT NOT NULL DEFAULT 'app' CHECK (service_type IN ('app', 'database', 'object-storage')),
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
  drain_timeout INTEGER,
  request_timeout INTEGER,
  command TEXT,
  icon TEXT,
  current_deployment_id TEXT,
  frost_file_path TEXT DEFAULT 'frost.yaml',
  replica_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(environment_id, name)
);

INSERT INTO services_new (
  id,
  environment_id,
  name,
  hostname,
  deploy_type,
  service_type,
  repo_url,
  branch,
  dockerfile_path,
  build_context,
  image_url,
  registry_id,
  env_vars,
  container_port,
  health_check_path,
  health_check_timeout,
  auto_deploy,
  volumes,
  tcp_proxy_port,
  memory_limit,
  cpu_limit,
  shutdown_timeout,
  drain_timeout,
  request_timeout,
  command,
  icon,
  current_deployment_id,
  frost_file_path,
  replica_count,
  created_at
)
SELECT
  id,
  environment_id,
  name,
  hostname,
  deploy_type,
  service_type,
  repo_url,
  branch,
  dockerfile_path,
  build_context,
  image_url,
  registry_id,
  env_vars,
  container_port,
  health_check_path,
  health_check_timeout,
  auto_deploy,
  volumes,
  tcp_proxy_port,
  memory_limit,
  cpu_limit,
  shutdown_timeout,
  drain_timeout,
  request_timeout,
  command,
  icon,
  current_deployment_id,
  frost_file_path,
  replica_count,
  created_at
FROM services;

DROP TABLE services;
ALTER TABLE services_new RENAME TO services;

CREATE INDEX idx_services_environment_id ON services(environment_id);
CREATE UNIQUE INDEX idx_services_environment_hostname ON services(environment_id, hostname);

PRAGMA foreign_keys = ON;

CREATE TABLE object_storages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  engine TEXT NOT NULL DEFAULT 'garage' CHECK (engine IN ('garage')),
  runtime_service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  region TEXT NOT NULL DEFAULT 'auto',
  internal_endpoint TEXT NOT NULL,
  external_endpoint TEXT,
  admin_token_encrypted TEXT NOT NULL,
  metrics_token_encrypted TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(environment_id, name),
  UNIQUE(environment_id, slug),
  UNIQUE(runtime_service_id)
);

CREATE INDEX idx_object_storages_project_id ON object_storages(project_id);
CREATE INDEX idx_object_storages_environment_id ON object_storages(environment_id);
CREATE INDEX idx_object_storages_runtime_service_id ON object_storages(runtime_service_id);

CREATE TABLE object_storage_buckets (
  id TEXT PRIMARY KEY,
  object_storage_id TEXT NOT NULL REFERENCES object_storages(id) ON DELETE CASCADE,
  garage_bucket_id TEXT,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(object_storage_id, name)
);

CREATE INDEX idx_object_storage_buckets_object_storage_id ON object_storage_buckets(object_storage_id);

CREATE TABLE object_storage_access_keys (
  id TEXT PRIMARY KEY,
  object_storage_id TEXT NOT NULL REFERENCES object_storages(id) ON DELETE CASCADE,
  bucket_id TEXT REFERENCES object_storage_buckets(id) ON DELETE SET NULL,
  access_key_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions TEXT NOT NULL CHECK (permissions IN ('read-only', 'read-write', 'full')),
  secret_access_key_encrypted TEXT,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  UNIQUE(object_storage_id, access_key_id)
);

CREATE INDEX idx_object_storage_access_keys_object_storage_id ON object_storage_access_keys(object_storage_id);
CREATE INDEX idx_object_storage_access_keys_bucket_id ON object_storage_access_keys(bucket_id);

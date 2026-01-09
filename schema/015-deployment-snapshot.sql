ALTER TABLE deployments ADD COLUMN image_name TEXT;
ALTER TABLE deployments ADD COLUMN env_vars_snapshot TEXT;
ALTER TABLE deployments ADD COLUMN container_port INTEGER;
ALTER TABLE deployments ADD COLUMN health_check_path TEXT;
ALTER TABLE deployments ADD COLUMN health_check_timeout INTEGER;
ALTER TABLE deployments ADD COLUMN volumes TEXT;
ALTER TABLE deployments ADD COLUMN rollback_eligible INTEGER DEFAULT 0;
ALTER TABLE deployments ADD COLUMN rollback_source_id TEXT;

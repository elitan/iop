ALTER TABLE services ADD COLUMN current_deployment_id TEXT REFERENCES deployments(id);

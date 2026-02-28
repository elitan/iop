PRAGMA foreign_keys = OFF;

CREATE TEMP TABLE map_projects (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_projects (old_id, new_id)
SELECT id, 'proj_' || lower(hex(randomblob(10))) FROM projects;

CREATE TEMP TABLE map_environments (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_environments (old_id, new_id)
SELECT id, 'env_' || lower(hex(randomblob(10))) FROM environments;

CREATE TEMP TABLE map_services (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_services (old_id, new_id)
SELECT id, 'svc_' || lower(hex(randomblob(10))) FROM services;

CREATE TEMP TABLE map_deployments (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_deployments (old_id, new_id)
SELECT id, 'dep_' || lower(hex(randomblob(10))) FROM deployments;

CREATE TEMP TABLE map_domains (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_domains (old_id, new_id)
SELECT id, 'dom_' || lower(hex(randomblob(10))) FROM domains;

CREATE TEMP TABLE map_registries (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_registries (old_id, new_id)
SELECT id, 'reg_' || lower(hex(randomblob(10))) FROM registries;

CREATE TEMP TABLE map_api_keys (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_api_keys (old_id, new_id)
SELECT id, 'key_' || lower(hex(randomblob(10))) FROM api_keys;

CREATE TEMP TABLE map_replicas (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_replicas (old_id, new_id)
SELECT id, 'rep_' || lower(hex(randomblob(10))) FROM replicas;

CREATE TEMP TABLE map_databases (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_databases (old_id, new_id)
SELECT id, 'db_' || lower(hex(randomblob(10))) FROM databases;

CREATE TEMP TABLE map_database_targets (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_database_targets (old_id, new_id)
SELECT id, 'dbt_' || lower(hex(randomblob(10))) FROM database_targets;

CREATE TEMP TABLE map_database_target_deployments (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_database_target_deployments (old_id, new_id)
SELECT id, 'dtd_' || lower(hex(randomblob(10))) FROM database_target_deployments;

CREATE TEMP TABLE map_environment_database_attachments (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_environment_database_attachments (old_id, new_id)
SELECT id, 'att_' || lower(hex(randomblob(10))) FROM environment_database_attachments;

CREATE TEMP TABLE map_service_database_bindings (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_service_database_bindings (old_id, new_id)
SELECT id, 'bind_' || lower(hex(randomblob(10))) FROM service_database_bindings;

CREATE TEMP TABLE map_github_installations (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_github_installations (old_id, new_id)
SELECT id, 'ghinst_' || lower(hex(randomblob(10))) FROM github_installations;

CREATE TEMP TABLE map_oauth_clients (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_oauth_clients (old_id, new_id)
SELECT id, 'oauthc_' || lower(hex(randomblob(10))) FROM oauth_clients;

CREATE TEMP TABLE map_oauth_codes (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_oauth_codes (old_id, new_id)
SELECT id, 'oauthcode_' || lower(hex(randomblob(10))) FROM oauth_codes;

CREATE TEMP TABLE map_oauth_tokens (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_oauth_tokens (old_id, new_id)
SELECT id, 'oauthtok_' || lower(hex(randomblob(10))) FROM oauth_tokens;

CREATE TEMP TABLE map_runtime_services (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL UNIQUE
);
INSERT INTO map_runtime_services (old_id, new_id)
SELECT DISTINCT runtime_service_id, 'rtsvc_' || lower(hex(randomblob(10)))
FROM database_targets
WHERE runtime_service_id IS NOT NULL AND runtime_service_id != '';

UPDATE projects
SET id = (SELECT new_id FROM map_projects WHERE old_id = projects.id);

UPDATE environments
SET id = (SELECT new_id FROM map_environments WHERE old_id = environments.id);

UPDATE services
SET id = (SELECT new_id FROM map_services WHERE old_id = services.id);

UPDATE deployments
SET id = (SELECT new_id FROM map_deployments WHERE old_id = deployments.id);

UPDATE domains
SET id = (SELECT new_id FROM map_domains WHERE old_id = domains.id);

UPDATE registries
SET id = (SELECT new_id FROM map_registries WHERE old_id = registries.id);

UPDATE api_keys
SET id = (SELECT new_id FROM map_api_keys WHERE old_id = api_keys.id);

UPDATE replicas
SET id = (SELECT new_id FROM map_replicas WHERE old_id = replicas.id);

UPDATE databases
SET id = (SELECT new_id FROM map_databases WHERE old_id = databases.id);

UPDATE database_targets
SET id = (SELECT new_id FROM map_database_targets WHERE old_id = database_targets.id);

UPDATE database_target_deployments
SET id = (
  SELECT new_id
  FROM map_database_target_deployments
  WHERE old_id = database_target_deployments.id
);

UPDATE environment_database_attachments
SET id = (
  SELECT new_id
  FROM map_environment_database_attachments
  WHERE old_id = environment_database_attachments.id
);

UPDATE service_database_bindings
SET id = (
  SELECT new_id
  FROM map_service_database_bindings
  WHERE old_id = service_database_bindings.id
);

UPDATE github_installations
SET id = (
  SELECT new_id
  FROM map_github_installations
  WHERE old_id = github_installations.id
);

UPDATE oauth_clients
SET id = (SELECT new_id FROM map_oauth_clients WHERE old_id = oauth_clients.id);

UPDATE oauth_codes
SET id = (SELECT new_id FROM map_oauth_codes WHERE old_id = oauth_codes.id);

UPDATE oauth_tokens
SET id = (SELECT new_id FROM map_oauth_tokens WHERE old_id = oauth_tokens.id);

UPDATE environments
SET project_id = (
  SELECT new_id
  FROM map_projects
  WHERE old_id = environments.project_id
);

UPDATE services
SET environment_id = (
  SELECT new_id
  FROM map_environments
  WHERE old_id = services.environment_id
);

UPDATE services
SET registry_id = CASE
  WHEN registry_id IS NULL THEN NULL
  ELSE (SELECT new_id FROM map_registries WHERE old_id = services.registry_id)
END;

UPDATE services
SET current_deployment_id = CASE
  WHEN current_deployment_id IS NULL THEN NULL
  ELSE (
    SELECT new_id
    FROM map_deployments
    WHERE old_id = services.current_deployment_id
  )
END;

UPDATE deployments
SET service_id = (
  SELECT new_id
  FROM map_services
  WHERE old_id = deployments.service_id
);

UPDATE deployments
SET environment_id = (
  SELECT new_id
  FROM map_environments
  WHERE old_id = deployments.environment_id
);

UPDATE deployments
SET rollback_source_id = CASE
  WHEN rollback_source_id IS NULL THEN NULL
  ELSE (
    SELECT new_id
    FROM map_deployments
    WHERE old_id = deployments.rollback_source_id
  )
END;

UPDATE domains
SET service_id = (
  SELECT new_id
  FROM map_services
  WHERE old_id = domains.service_id
);

UPDATE domains
SET environment_id = (
  SELECT new_id
  FROM map_environments
  WHERE old_id = domains.environment_id
);

UPDATE metrics
SET service_id = CASE
  WHEN service_id IS NULL THEN NULL
  ELSE (SELECT new_id FROM map_services WHERE old_id = metrics.service_id)
END;

UPDATE replicas
SET deployment_id = (
  SELECT new_id
  FROM map_deployments
  WHERE old_id = replicas.deployment_id
);

UPDATE databases
SET project_id = (
  SELECT new_id
  FROM map_projects
  WHERE old_id = databases.project_id
);

UPDATE database_targets
SET database_id = (
  SELECT new_id
  FROM map_databases
  WHERE old_id = database_targets.database_id
);

UPDATE database_targets
SET source_target_id = CASE
  WHEN source_target_id IS NULL THEN NULL
  ELSE (
    SELECT new_id
    FROM map_database_targets
    WHERE old_id = database_targets.source_target_id
  )
END;

UPDATE database_targets
SET runtime_service_id = CASE
  WHEN runtime_service_id IS NULL OR runtime_service_id = '' THEN runtime_service_id
  ELSE (
    SELECT new_id
    FROM map_runtime_services
    WHERE old_id = database_targets.runtime_service_id
  )
END;

UPDATE database_target_deployments
SET target_id = (
  SELECT new_id
  FROM map_database_targets
  WHERE old_id = database_target_deployments.target_id
);

UPDATE environment_database_attachments
SET environment_id = (
  SELECT new_id
  FROM map_environments
  WHERE old_id = environment_database_attachments.environment_id
);

UPDATE environment_database_attachments
SET database_id = (
  SELECT new_id
  FROM map_databases
  WHERE old_id = environment_database_attachments.database_id
);

UPDATE environment_database_attachments
SET target_id = (
  SELECT new_id
  FROM map_database_targets
  WHERE old_id = environment_database_attachments.target_id
);

UPDATE service_database_bindings
SET service_id = (
  SELECT new_id
  FROM map_services
  WHERE old_id = service_database_bindings.service_id
);

UPDATE service_database_bindings
SET database_id = (
  SELECT new_id
  FROM map_databases
  WHERE old_id = service_database_bindings.database_id
);

PRAGMA foreign_keys = ON;

PRAGMA foreign_key_check;

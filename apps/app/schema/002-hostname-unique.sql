-- Auto-fix duplicate hostnames by adding numeric suffix
UPDATE services
SET hostname = hostname || '-' || (
  SELECT COUNT(*)
  FROM services s2
  WHERE s2.environment_id = services.environment_id
    AND s2.hostname = services.hostname
    AND s2.rowid < services.rowid
)
WHERE EXISTS (
  SELECT 1
  FROM services s2
  WHERE s2.environment_id = services.environment_id
    AND s2.hostname = services.hostname
    AND s2.id != services.id
);

CREATE UNIQUE INDEX idx_services_environment_hostname ON services(environment_id, hostname);

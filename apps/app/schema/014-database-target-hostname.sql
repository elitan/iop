ALTER TABLE database_targets ADD COLUMN hostname TEXT NOT NULL DEFAULT '';

UPDATE database_targets
SET hostname = name
WHERE hostname = '';

CREATE UNIQUE INDEX idx_database_targets_database_id_hostname
ON database_targets(database_id, hostname);

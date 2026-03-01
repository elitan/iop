ALTER TABLE database_targets ADD COLUMN ttl_value INTEGER;
ALTER TABLE database_targets ADD COLUMN ttl_unit TEXT CHECK (ttl_unit IN ('hours', 'days'));
ALTER TABLE database_targets ADD COLUMN scale_to_zero_minutes INTEGER;
ALTER TABLE database_targets ADD COLUMN last_activity_at INTEGER;
ALTER TABLE database_targets ADD COLUMN runtime_host_port INTEGER;

CREATE INDEX idx_database_targets_scale_to_zero_minutes
ON database_targets(scale_to_zero_minutes);

CREATE INDEX idx_database_targets_ttl
ON database_targets(ttl_value, ttl_unit);

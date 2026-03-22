ALTER TABLE database_targets
ADD COLUMN stopped_reason TEXT CHECK (stopped_reason IN ('idle', 'failed'));

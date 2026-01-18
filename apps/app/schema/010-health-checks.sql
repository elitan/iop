ALTER TABLE services ADD COLUMN health_check_path TEXT DEFAULT NULL;
ALTER TABLE services ADD COLUMN health_check_timeout INTEGER DEFAULT 60;

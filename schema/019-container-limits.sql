ALTER TABLE services ADD COLUMN memory_limit TEXT;
ALTER TABLE services ADD COLUMN cpu_limit REAL;
ALTER TABLE services ADD COLUMN shutdown_timeout INTEGER;

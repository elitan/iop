-- Add hostname column for DNS-safe identifiers
ALTER TABLE services ADD COLUMN hostname TEXT;
ALTER TABLE projects ADD COLUMN hostname TEXT;

-- Populate with slugified name (lowercase, spaces to hyphens)
-- App code will handle proper sanitization for new entries
UPDATE services SET hostname = lower(replace(replace(name, ' ', '-'), '_', '-'));
UPDATE projects SET hostname = lower(replace(replace(name, ' ', '-'), '_', '-'));

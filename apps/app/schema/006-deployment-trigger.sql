ALTER TABLE deployments ADD COLUMN trigger TEXT DEFAULT 'manual';
ALTER TABLE deployments ADD COLUMN triggered_by_username TEXT;
ALTER TABLE deployments ADD COLUMN triggered_by_avatar_url TEXT;

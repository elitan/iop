ALTER TABLE domains ADD COLUMN is_system INTEGER DEFAULT 0 CHECK (is_system IN (0, 1));

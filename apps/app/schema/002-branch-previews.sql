-- Add pr_comment_id to track GitHub PR comment for updates
ALTER TABLE environments ADD COLUMN pr_comment_id INTEGER;

-- Index for branch lookup
CREATE INDEX idx_environments_branch ON environments(project_id, pr_branch);

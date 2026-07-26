-- 0020: Second round of performance indexes (2026-07-26 review)
--
-- Idempotent: safe to re-run on every deploy (deploy.sh applies all
-- migrations each time). CONCURRENTLY works because psql runs these in
-- autocommit mode. If a CONCURRENTLY build is ever interrupted it leaves an
-- INVALID index that IF NOT EXISTS will skip — check with \d tasks if in
-- doubt and DROP INDEX the invalid one.

-- completed_at is filtered/ordered by the Today page, Members page (done 1d/
-- 7d/30d), and every dashboard stat — but no index touched it at all.
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_done_completed_idx
  ON tasks (completed_at) WHERE status = 'done';
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_assignee_completed_idx
  ON tasks (assignee_id, completed_at) WHERE status = 'done';

-- Task search uses ilike '%q%' on title + description (leading wildcard —
-- btree can't help). pg_trgm GIN makes it indexable.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_title_trgm_idx
  ON tasks USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_desc_trgm_idx
  ON tasks USING gin (description gin_trgm_ops);

-- Members page + dashboards count comments by author within a date window;
-- existing index is (author_id) only.
CREATE INDEX CONCURRENTLY IF NOT EXISTS task_comments_author_created_idx
  ON task_comments (author_id, created_at);

-- Redundant duplicates from 0012 (schema.ts already defines tasks_project_idx
-- on (project_id, status) and tasks_parent_idx on parent_task_id).
DROP INDEX CONCURRENTLY IF EXISTS tasks_project_id_idx;
DROP INDEX CONCURRENTLY IF EXISTS tasks_parent_id_idx;

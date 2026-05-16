-- 0012: Performance indexes for tasks page
-- The tasks page orders by created_at desc and filters by status + due_date

-- Covers the default sort (created_at DESC) with status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_created_desc_idx ON tasks(created_at DESC);

-- Covers overdue check: status NOT IN (done, cancelled) AND due_date < today
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_active_due_idx ON tasks(due_date, status) WHERE status NOT IN ('done', 'cancelled');

-- Covers assignee scoped queries (manager/member view)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_assignee_created_idx ON tasks(assignee_id, created_at DESC);

-- Covers created_by scoped queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_creator_created_idx ON tasks(created_by_id, created_at DESC);

-- Covers parent_task_id subquery (scope filter + subtask listing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_parent_id_idx ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

-- Covers project_id lookups (pane content, stats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);

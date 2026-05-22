-- 0018_task_recurrence.sql
--
-- Daily / Weekly / Monthly recurring tasks.
--
-- Behaviour:
--   - `recurrence` is set at task creation time and stays on every instance
--     in the chain.
--   - When a task is marked status='done', if its recurrence is anything
--     other than 'none' the server action spawns a fresh task for the next
--     cycle (dueDate + 1 day / 7 days / 1 month) that points back at the
--     completed one via `recurrence_parent_id`, preserving full audit trail.
--   - One-off tasks default to recurrence='none' so nothing changes for
--     existing rows.
--
-- We store the recurrence as a plain text column (rather than a PG enum)
-- so the option set can be extended later without an enum-migration dance.
-- A CHECK constraint enforces the current valid values.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none';

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_recurrence_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_recurrence_check
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS recurrence_parent_id uuid
  REFERENCES tasks(id) ON DELETE SET NULL;

-- Partial index — most tasks are recurrence='none', skip them.
CREATE INDEX IF NOT EXISTS tasks_recurrence_idx
  ON tasks(recurrence)
  WHERE recurrence <> 'none';

CREATE INDEX IF NOT EXISTS tasks_recurrence_parent_idx
  ON tasks(recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

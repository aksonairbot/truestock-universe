-- 0011: Add due_time column to tasks (subtask-level time deadlines)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_time text;

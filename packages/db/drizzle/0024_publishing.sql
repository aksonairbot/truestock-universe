-- 0024: Publishing handoff (Stage 3)
--
-- SeekPeak stays the source of truth for WHAT goes out and WHO approved it.
-- The actual posting is handed to Upload-post, which already holds the OAuth
-- tokens for the networks — we deliberately do NOT rebuild auth for a dozen
-- social platforms inside a task manager.
--
-- publish_state is a small state machine, separate from content_stage:
--   content_stage = where the WORK is (idea → script → design → review → …)
--   publish_state = what the PUBLISHER did (idle → queued → published/failed)
-- Keeping them apart means a failed post doesn't rewrite the editorial
-- history, and a human can retry without the pipeline stage flapping.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS publish_state   text NOT NULL DEFAULT 'idle';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS published_url   text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS published_at    timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS publish_ref     text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS publish_error   text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS publish_profile text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_publish_state_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_publish_state_check
      CHECK (publish_state IN ('idle', 'queued', 'publishing', 'published', 'failed'));
  END IF;
END $$;

-- The sweep's hot query: "approved content whose slot has arrived and which
-- nothing has posted yet". Partial so the index stays tiny next to a task
-- table that is overwhelmingly NOT content.
CREATE INDEX IF NOT EXISTS tasks_publish_due_idx
  ON tasks (publish_at)
  WHERE content_channel IS NOT NULL AND publish_state IN ('idle', 'queued');

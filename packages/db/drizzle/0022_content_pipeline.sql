-- 0022: Content pipeline (Stage 1)
--
-- A task becomes a content item when content_channel is set. Kept on `tasks`
-- rather than a new table so content inherits assignee, comments, links,
-- attachments, the approval flow and the permission model unchanged.
--
-- publish_at is deliberately separate from due_date: due_date is when the
-- WORK is due, publish_at is when it goes LIVE. A reel due Tuesday can be
-- scheduled to publish Friday.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_channel text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_stage   text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS publish_at      timestamptz;

-- Calendar reads scan by publish_at; partial index keeps it tiny since the
-- overwhelming majority of tasks are not content.
CREATE INDEX IF NOT EXISTS tasks_publish_idx
  ON tasks (publish_at) WHERE publish_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_content_channel_idx
  ON tasks (content_channel) WHERE content_channel IS NOT NULL;

-- Vocabularies guarded with CHECKs rather than enums: channels and stages
-- will grow (threads, pinterest, whatsapp…) and adding an enum value
-- requires a migration lock, while a CHECK can be swapped cheaply.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_content_channel_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_content_channel_check
      CHECK (content_channel IS NULL OR content_channel IN (
        'instagram','linkedin','youtube','x','reddit','facebook',
        'tiktok','email','google_ads','webinar','blog'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_content_stage_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_content_stage_check
      CHECK (content_stage IS NULL OR content_stage IN (
        'idea','script','design','review','scheduled','published'
      ));
  END IF;
END $$;

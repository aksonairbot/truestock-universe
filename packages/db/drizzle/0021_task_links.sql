-- 0021: External links on tasks (Figma / asset / live URL)
--
-- Stage 0 of the content pipeline. Rows rather than columns because content
-- work carries several links (a script doc, multiple creatives, and one
-- published URL per channel). Idempotent — deploy.sh re-runs every migration.

CREATE TABLE IF NOT EXISTS task_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind            text NOT NULL DEFAULT 'other',
  url             text NOT NULL,
  label           text,
  created_by_id   uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_links_task_idx ON task_links(task_id);

-- Guard the vocabulary without an enum (kinds will grow: 'post', 'ad', …)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_links_kind_check'
  ) THEN
    ALTER TABLE task_links
      ADD CONSTRAINT task_links_kind_check
      CHECK (kind IN ('figma', 'asset', 'live', 'doc', 'other'));
  END IF;
END $$;

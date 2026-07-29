-- 0023: Content approval gate (Stage 2)
--
-- Nothing reaches Scheduled or Published without a NAMED approver on record.
-- For SEBI-regulated financial content, "who signed this off and when" is a
-- compliance record, not a nicety — so it lives in columns that can be
-- queried and exported, not only in a comment thread.
--
-- compliance_checked is a deliberate second signal: approval means "the
-- content is right", compliance means "the disclaimers/registration details
-- required for financial promotions are present".

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_approved_by_id uuid REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_approved_at    timestamptz;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS compliance_checked     boolean NOT NULL DEFAULT false;

-- Fast lookup of "approved content awaiting publish"
CREATE INDEX IF NOT EXISTS tasks_content_approved_idx
  ON tasks (content_approved_at) WHERE content_approved_at IS NOT NULL;

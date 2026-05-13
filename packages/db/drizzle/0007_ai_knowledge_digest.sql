-- 0007: AI knowledge digest — nightly snapshots of project/team context
-- so every AI call has institutional memory.

CREATE TABLE IF NOT EXISTS ai_knowledge_digests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  scope       text NOT NULL DEFAULT 'global',   -- 'global' or a project slug
  digest      jsonb NOT NULL,                    -- structured snapshot (see below)
  summary     text,                              -- LLM-generated prose summary
  generated_at timestamptz NOT NULL DEFAULT now(),
  duration_ms  integer,
  provider    text,
  model       text,
  CONSTRAINT uq_digest_date_scope UNIQUE (date, scope)
);

CREATE INDEX idx_digest_date ON ai_knowledge_digests (date DESC);
CREATE INDEX idx_digest_scope ON ai_knowledge_digests (scope, date DESC);

-- digest jsonb structure:
-- {
--   "projects": [{ slug, name, openTasks, doneTasks, recentTitles[], topAssignees[] }],
--   "teamPatterns": { avgTasksPerDay, busiestProject, commonLabels[] },
--   "recentDecisions": ["string summaries of completed tasks with descriptions"],
--   "activeThemes": ["recurring topic clusters from recent task titles"]
-- }

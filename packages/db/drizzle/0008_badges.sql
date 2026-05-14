-- 0008: Achievement badges for users
-- Tracks which badges each user has earned and when.

CREATE TABLE IF NOT EXISTS user_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key   text NOT NULL,
  awarded_at  timestamptz NOT NULL DEFAULT now(),
  meta        jsonb,  -- optional context (e.g. { taskId, projectSlug, count })
  CONSTRAINT uq_user_badge UNIQUE (user_id, badge_key)
);

CREATE INDEX idx_badges_user ON user_badges (user_id, awarded_at DESC);
CREATE INDEX idx_badges_key ON user_badges (badge_key);

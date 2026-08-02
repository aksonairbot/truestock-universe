-- 0030: Contribution standing
--
-- A manager-assigned standing that ONLY the person themselves, their manager,
-- and an admin can see. Peers never see each other's.
--
-- WHY THE NOTE COLUMN IS NOT OPTIONAL IN PRACTICE
-- A rating with no reason attached is unfalsifiable. The person can't act on
-- it, can't disagree with it specifically, and can't tell what would change
-- it — which is how a standing stops being feedback and becomes a verdict.
-- The database allows null (a row can predate the rule); the server action
-- refuses to WRITE one without a reason. That split is deliberate: the
-- constraint belongs where the human is, not where the backfill is.
--
-- WHY THERE IS A HISTORY TABLE
-- Three reasons, all of them about trust:
--   1. The person can see that their standing moved, when, and why — not just
--      today's value with no memory of how it got there.
--   2. A manager's judgement is attributable. "Who decided this?" always has
--      an answer.
--   3. A standing that quietly drifts down over months is invisible in a
--      single column and obvious in a list.
--
-- WHAT THIS IS NOT
-- Not a leaderboard, not a score, not points. There is deliberately no way to
-- sort the team by it and no org-wide distribution chart. You can see a
-- person's standing on that person's row; you cannot rank people with it.
-- SeekPeak does not do competitive mechanics, and this is the feature most
-- likely to be turned into one by accident.

-- The four values. Deliberately NOT A/B/C — a letter grade reads as a report
-- card, and "steady" is meant to be the healthy majority, not a middling mark.
--   exceeding  — well beyond what the role asks
--   strong     — consistently above the bar
--   steady     — meeting the bar (where most people should sit)
--   developing — building towards the bar, needs support
--
-- A text column with a CHECK rather than an enum: enum values cannot be
-- removed or renamed in Postgres without a table rewrite, and the vocabulary
-- for how you describe people is exactly the thing that gets revised.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_tier text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_tier_note text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_tier_set_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contribution_tier_set_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_contribution_tier_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_contribution_tier_check
      CHECK (contribution_tier IS NULL
             OR contribution_tier IN ('exceeding', 'strong', 'steady', 'developing'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contribution_tier_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Null is a real value here: it records "the standing was cleared".
  tier        text,
  note        text,
  set_by_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contribution_tier_history_tier_check
    CHECK (tier IS NULL OR tier IN ('exceeding', 'strong', 'steady', 'developing'))
);

-- The only query this table serves: "this one person's standing, newest first."
CREATE INDEX IF NOT EXISTS contribution_tier_history_user_idx
  ON contribution_tier_history (user_id, created_at DESC);

-- The person is told their standing changed. The notification body carries NO
-- tier value, on purpose: notifications are delivered by email, and "you have
-- been moved to Developing" is not a sentence that should arrive in an inbox
-- with no conversation around it. The message says it changed and where to
-- look; the value itself lives behind the person's own login.
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'standing_updated';

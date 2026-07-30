-- 0028: Content watchdog notifications
--
-- The pipeline knows things nobody has to be told: that a post goes out on
-- Thursday and still has no approver, that a piece has sat in "design" for
-- nine days, that a publish failed at 6am. Until now the system held all of
-- that quietly and waited to be asked.
--
-- This adds the notification kind the watchdog sends under. A new kind rather
-- than reusing review_requested: these are machine-raised warnings, not a
-- person asking for a review, and conflating them would make the inbox lie
-- about who wants what from you.
--
-- ALTER TYPE ... ADD VALUE is not reversible, which is exactly why it gets
-- IF NOT EXISTS and lives alone in its own migration.

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'content_at_risk';

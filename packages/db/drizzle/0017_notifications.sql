-- 0017: Create notifications table + notification_kind enum
-- This table was defined in the Drizzle schema but never had a migration file.

DO $$ BEGIN
  CREATE TYPE "notification_kind" AS ENUM (
    'mention',
    'assigned',
    'task_completed',
    'comment_on_assigned',
    'review_requested',
    'review_approved',
    'review_revision'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        notification_kind NOT NULL,
  task_id     uuid REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, created_at) WHERE read_at IS NULL;

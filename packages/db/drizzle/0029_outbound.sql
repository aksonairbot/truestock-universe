-- 0029: Outbound delivery
--
-- Until now every notification stopped at the database. The assignee found out
-- they'd been given work the next time they happened to open SeekPeak — which
-- also meant the content watchdog, a feature whose whole purpose is to speak
-- up, only spoke to people already looking at it.
--
-- Two columns, both about restraint rather than reach:
--
--   users.notify_outbound — a personal off switch. Deliberately NOT named per
--     channel. The first draft called it notify_whatsapp; WhatsApp turned out
--     to be the wrong transport (Meta requires pre-approved templates for any
--     message outside a 24-hour window the user has to open, which a "task
--     assigned" notification never is), and a column named after a transport
--     would have meant a migration every time the transport changed. What the
--     person is actually expressing is "message me outside the app" — so that
--     is what the column stores.
--
--   notifications.delivered_at — proof of what actually left the building.
--     Without it a retry or a re-run of the daily job would message the same
--     person twice, and there would be no way to tell a delivery failure from
--     a message nobody read.

DO $$
BEGIN
  -- Rename rather than add, so a box that already ran an earlier draft of this
  -- migration keeps whatever preferences people had set.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'users' AND column_name = 'notify_whatsapp')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'users' AND column_name = 'notify_outbound') THEN
    ALTER TABLE users RENAME COLUMN notify_whatsapp TO notify_outbound;
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_outbound boolean NOT NULL DEFAULT true;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- The delivery sweep's hot query: "recently created, not yet delivered".
CREATE INDEX IF NOT EXISTS notifications_undelivered_idx
  ON notifications (created_at)
  WHERE delivered_at IS NULL;

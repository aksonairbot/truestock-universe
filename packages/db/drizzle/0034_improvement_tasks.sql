-- 0034: Tasks a manager asks for, to improve a standing
--
-- This is the honest version of the request that started the rating work:
-- "if you do 5 tasks you will become A from B". A threshold like that is a
-- promise only a manager can keep, so instead of the system inventing one,
-- the MANAGER NAMES THE ACTUAL WORK. "Availability and inter-team
-- communication can be improved" stops being a sentence in a review and
-- becomes two tasks with dates on them.
--
-- It still promises nothing — doing them does not automatically move anyone.
-- But it turns "be better" into something a person can actually do on Tuesday,
-- which is the whole difference between feedback and a verdict.
--
-- WHY A COLUMN AND NOT A SEPARATE TABLE
-- An improvement task IS a task: it needs an assignee, a due date, a status,
-- comments, and to show up in the person's queue alongside everything else. A
-- parallel table would duplicate all of that and then need reconciling.
--
-- WHY improvement_for RATHER THAN A BOOLEAN
-- A boolean would rely on assignee_id to say who it is about, and those come
-- apart the moment a task is reassigned — the item would silently move to
-- someone else's rating page. Naming the person explicitly means reassignment
-- changes who does the work without changing whose growth it belongs to.
--
-- WHY NO FOREIGN KEY
-- Deliberate. Adding a REFERENCES to `tasks` takes an ACCESS EXCLUSIVE lock on
-- it and a validation scan, and `tasks` is the busiest table here — that is
-- how a deploy hangs behind one idle-in-transaction connection and takes the
-- whole app's queries into the queue with it. The value is written only by one
-- server action which has already loaded the user, so the integrity this would
-- buy is integrity we already have.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS improvement_for uuid;

-- The only query this serves: "what has this person been asked to work on".
CREATE INDEX IF NOT EXISTS tasks_improvement_for_idx
  ON tasks (improvement_for, created_at DESC)
  WHERE improvement_for IS NOT NULL;

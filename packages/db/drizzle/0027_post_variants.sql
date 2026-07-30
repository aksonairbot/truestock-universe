-- 0027: Per-network variants of one post
--
-- THE MODELLING DECISION
-- One idea — "Q2 results" — goes out long on LinkedIn, threaded on X, and
-- image-first on Instagram. Three different captions, three different slots,
-- three separate approvals, three separate publish attempts.
--
-- Two ways to model that:
--
--   (a) a task_post_variants table holding caption + slot + approval +
--       publish_state per channel. This DUPLICATES the entire approval and
--       publishing apparatus for a second entity type. Every rule — the
--       approval gate, the compliance flag, the publish state machine, the
--       stale-slot sweep — would need a parallel implementation.
--
--   (b) each variant IS a content task, and they share a group id.
--
-- (b) wins, and not just for effort: a variant genuinely NEEDS everything a
-- content task has. Instagram's version can be approved while LinkedIn's is
-- still in review. X's can fail to publish while the others succeed. Those are
-- per-channel facts, and (a) would have had to reinvent columns for all of them.
--
-- Deliberately NOT reusing parent_task_id: that column means "subtask", and a
-- variant is a PEER, not a child. Overloading it would make variants show up
-- in the subtask checklist and count towards subtask progress, which is wrong
-- twice over. A group is a set of equals with no primary.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS post_group_id uuid;

-- Partial: the overwhelming majority of tasks are not content, let alone
-- multi-channel content, so the index stays small.
CREATE INDEX IF NOT EXISTS tasks_post_group_idx
  ON tasks (post_group_id)
  WHERE post_group_id IS NOT NULL;

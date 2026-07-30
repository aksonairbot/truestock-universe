-- 0026: Post composer — the copy becomes a first-class field
--
-- Learned from Planable / Buffer / SocialPilot. Until now the social caption
-- WAS the task description, which caused two real problems:
--
--   1. The publisher sliced every caption at 2200 characters regardless of
--      channel, silently destroying the tail of any X post (limit 280) and any
--      long LinkedIn piece (3000). Data loss with no warning.
--   2. A task description is internal context — acceptance criteria, links for
--      the designer, notes to the reviewer. Publishing it verbatim to Instagram
--      is how internal notes end up in public.
--
-- Separating them means the description stays internal and the caption is
-- exactly what goes out, counted against the network's own limit while typing.
--
-- post_first_comment exists because hashtags in the first comment (rather than
-- the caption) is standard practice on Instagram, and there was nowhere to put
-- them that wasn't the caption itself.
--
-- content_pillar answers "what KIND of post is this". Not decoration: a feed
-- that is 70% promotion stops working, and for a SEBI-regulated firm the
-- promotional share is also the share that needs disclaimers. Tagging it is
-- what makes the ratio visible on the plan instead of a quarter late.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS post_caption       text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS post_first_comment text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS content_pillar     text;

DO $$
BEGIN
  -- CHECK, not an enum: pillars will change as the content strategy does, and
  -- adding an enum value takes a table lock.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_content_pillar_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_content_pillar_check
      CHECK (content_pillar IS NULL OR content_pillar IN
        ('education', 'market_update', 'product', 'brand', 'promotion', 'community'));
  END IF;
END $$;

-- Pillar mix is read per-campaign and per-month, always alongside a channel.
CREATE INDEX IF NOT EXISTS tasks_pillar_idx
  ON tasks (content_pillar)
  WHERE content_pillar IS NOT NULL;

-- 0033: "Play that one again"
--
-- People re-add the same songs constantly — that is what having taste looks
-- like — and until now doing it meant going back to YouTube, finding the video
-- again and pasting the link again. Everything needed to skip all of that was
-- already in music_tracks; it just had no index and no query.
--
-- No new table and no new columns. A person's library IS their history: every
-- row they ever added, grouped by video. Storing a separate "favourites" list
-- would have meant a second thing to keep in sync with the first, and a song
-- you queued three times is already telling us it's a favourite without anyone
-- having to press a star.
--
-- This index is the whole migration. The query behind the panel runs on every
-- poll for every person, so "who added what, most recent first" needs to be an
-- index scan rather than a walk over every track the office has ever played.
CREATE INDEX IF NOT EXISTS music_tracks_added_by_idx
  ON music_tracks (added_by_id, created_at DESC);

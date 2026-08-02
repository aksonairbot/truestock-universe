-- 0032: Broadcast where the track actually is
--
-- Everyone now sees a now-playing panel with a progress bar, not just the
-- machine driving the speaker. That needs a position, and there are two ways
-- to get one:
--
--   1. Stamp when a track started and let every screen compute now - started.
--      Cheap, and wrong the moment anyone pauses, seeks, or the speaker
--      window is closed and reopened mid-song. The bar would drift further
--      from reality all afternoon with nothing to correct it.
--
--   2. Have the speaker report the player's real currentTime. Costs nothing
--      extra — the heartbeat is already making that round trip every few
--      seconds — and it is the truth rather than an inference from it.
--
-- So: two columns on the singleton state row, written by the heartbeat.
-- Screens interpolate locally between beats, which makes the bar move smoothly
-- while never being more than one beat away from what the speaker is doing.
--
-- Nullable on purpose. No speaker connected means no position, and a progress
-- bar that reads 0:00 is a lie about a track that might be halfway through.
-- The UI renders nothing rather than something confidently wrong.

ALTER TABLE music_player_state ADD COLUMN IF NOT EXISTS position_seconds integer;
ALTER TABLE music_player_state ADD COLUMN IF NOT EXISTS duration_seconds integer;

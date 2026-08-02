-- 0031: The office jukebox
--
-- A shared queue. Anyone adds a track, anyone boosts one, and the speaker
-- plays whatever is on top. One machine keeps /music/player open; everybody
-- else drives it from their own screen.
--
-- WHY YOUTUBE AND NOT SPOTIFY
-- Not preference — Spotify's Web Playback SDK "must not be used in commercial
-- projects without Spotify's prior written approval", and an internal company
-- tool is a commercial project. Their 30-second preview URLs were also
-- deprecated for new apps. YouTube's embedded player is the one that can
-- legitimately play inside a web app we own, so that is what this stores: a
-- YouTube video id, and nothing that assumes a second provider exists. If
-- Spotify is ever added it will be a different column, not a reinterpretation
-- of this one.
--
-- WHY THERE IS NO "position" COLUMN
-- The obvious design gives every queued track an integer position and rewrites
-- them on every vote. That turns one person's boost into an UPDATE across the
-- whole table, and two simultaneous votes into a lost update. Order here is
-- DERIVED — boosts first, then who has been waiting longest — so a vote is one
-- INSERT and the ordering can never disagree with the votes that produced it.
--
-- WHY play_day EXISTS AND THERE IS NO SNAPSHOT TABLE
-- "A live queue that snapshots daily" sounds like a nightly job writing a
-- playlist row. It isn't one. Stamping the IST day a track actually played
-- makes the snapshot a GROUP BY, which means it can never drift from what was
-- really played, needs no cron, and cannot be missed because the server was
-- down at midnight. The history is just the table, read differently.

CREATE TABLE IF NOT EXISTS music_tracks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The YouTube video id, e.g. dQw4w9WgXcQ. Not a URL: the same video arrives
  -- as youtu.be, music.youtube.com, /shorts and /embed links, and storing the
  -- id is what makes "this is already in the queue" answerable.
  video_id       text NOT NULL,
  title          text NOT NULL,
  channel_title  text,
  -- Null when we only had oEmbed (no API key configured). The queue works
  -- fine without it; it just can't show or cap length.
  duration_seconds integer,
  thumbnail_url  text,
  added_by_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'queued',
  played_at      timestamptz,
  /** The IST calendar day this track played. Null until it does. */
  play_day       date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_tracks_status_check
    CHECK (status IN ('queued', 'playing', 'played', 'skipped'))
);

-- The queue read: "what's still waiting, oldest first".
CREATE INDEX IF NOT EXISTS music_tracks_queued_idx
  ON music_tracks (created_at)
  WHERE status = 'queued';

-- The history read: "what did we play on this day".
CREATE INDEX IF NOT EXISTS music_tracks_day_idx
  ON music_tracks (play_day, played_at)
  WHERE play_day IS NOT NULL;

-- AT MOST ONE TRACK CAN BE PLAYING, enforced by the database rather than by
-- everyone remembering to check. Two people opening the speaker page is a
-- normal accident, not an edge case, and without this it produces two songs
-- at once out of one pair of speakers.
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_one_playing_idx
  ON music_tracks (status)
  WHERE status = 'playing';

-- Votes.
--
-- 'boost' pushes a queued track up. 'skip' is a vote to stop the thing playing
-- RIGHT NOW. They are deliberately different verbs, not +1/-1 on one scale:
-- downvoting a song a colleague queued is a small public insult, while voting
-- to move on from what's currently filling the room is a normal collective
-- decision. A four-person office does not need a way to rank each other's
-- taste; it needs a way to say "next, please".
CREATE TABLE IF NOT EXISTS music_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id    uuid NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_votes_kind_check CHECK (kind IN ('boost', 'skip'))
);

-- One vote of each kind per person per track. The uniqueness is the whole
-- anti-abuse story: no rate limits, no counters to reconcile, no way to stuff
-- the ballot by clicking faster.
CREATE UNIQUE INDEX IF NOT EXISTS music_votes_unique_idx
  ON music_votes (track_id, user_id, kind);
CREATE INDEX IF NOT EXISTS music_votes_track_idx ON music_votes (track_id, kind);

-- Is a speaker actually running?
--
-- Without this the queue page cannot tell "nothing is playing" from "nobody
-- has the player open", which are completely different problems and want
-- completely different sentences on screen. The player page touches this every
-- few seconds; a stale heartbeat means the room is quiet.
CREATE TABLE IF NOT EXISTS music_player_state (
  -- Deliberately a single row. One office, one speaker. If a second location
  -- ever needs its own, this becomes a room key and everything else still
  -- works — which is why it's a text primary key rather than a boolean.
  id             text PRIMARY KEY DEFAULT 'office',
  last_beat_at   timestamptz,
  host_user_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  /** Paused by a human, as opposed to nobody being connected. */
  is_paused      boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO music_player_state (id) VALUES ('office') ON CONFLICT (id) DO NOTHING;

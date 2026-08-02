// apps/web/lib/music.ts
//
// The jukebox rules. Everything here is about one question: when eighteen
// people share one pair of speakers, what stops it becoming annoying?
//
// FOUR RULES, and each exists because the version without it fails within a
// week of real use:
//
//   1. A CAP ON QUEUED TRACKS PER PERSON. Without it, whoever discovers the
//      feature first queues twenty songs on Monday morning and owns the office
//      until lunch. The cap is small enough to keep the queue turning over and
//      large enough to line up a run of three.
//
//   2. BOOSTS ORDER THE QUEUE, AND TIME BREAKS TIES. A pure vote sort starves
//      anything nobody has heard of — new tracks enter on zero and never move.
//      Falling back to "who has waited longest" means an unboosted song still
//      reaches the front eventually, which is what stops the jukebox becoming
//      a popularity contest between four people who are online right now.
//
//   3. SKIPPING IS COLLECTIVE, EXCEPT FOR YOUR OWN. The threshold scales with
//      how many people are actually around — two skips shouldn't end a song
//      when twelve are listening, and shouldn't need six when three are. But
//      you can always skip a track YOU queued, instantly: nobody needs a
//      committee to withdraw their own choice.
//
//   4. ONE TRACK PLAYS AT A TIME, ENFORCED BY THE DATABASE. Two people opening
//      the player page is normal, not exotic. The partial unique index in 0031
//      makes the second one lose a race rather than start a second song.

import { getDb, musicTracks, musicVotes, musicPlayerState, users, eq, and, sql, desc, asc } from "@tu/db";
import type { User } from "@tu/db";
import { isPrivileged } from "./access";
import { log } from "./log";

/**
 * WHO MAY TOUCH THE STEREO.
 *
 * Adding songs and boosting them stay open to everyone — that is the whole
 * point of a shared queue, and Amit was explicit that both stay. What is
 * restricted is *playback*: pause, next, volume, and the speaker window
 * itself. The distinction is between putting a song forward and reaching over
 * to the stereo while other people are listening to it.
 *
 * Deliberately its own named function rather than isPrivileged() sprinkled
 * through the actions. When someone later asks for a "DJ" role, or for the
 * host machine to own it regardless of role, this is the single line that
 * changes — and it is impossible to miss one call site, because every check
 * goes through here.
 */
export function canControlPlayback(user: User): boolean {
  return isPrivileged(user);
}

/** Enough to line up a run; few enough that the queue keeps moving. */
export const MAX_QUEUED_PER_PERSON = 3;

/**
 * Twelve minutes. Long enough for almost any song, short enough to refuse a
 * "2 HOUR LOFI MIX" — which is not a track, it's a takeover. Only enforced
 * when we actually know the duration (i.e. when YOUTUBE_API_KEY is set); the
 * skip vote is the backstop when we don't.
 */
export const MAX_TRACK_SECONDS = 12 * 60;

/** No beat for this long and we treat the speaker as switched off. */
export const HEARTBEAT_STALE_MS = 25_000;

export interface QueueTrack {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  addedById: string | null;
  addedByName: string | null;
  boosts: number;
  /** Did the person looking at this already boost it? */
  boostedByMe: boolean;
  isMine: boolean;
  createdAt: Date;
}

/**
 * Skip used to be a collective vote with a threshold that scaled to how many
 * people were around. It is now an admin/manager action (plus "skip your own"),
 * so the vote counting is gone. The `skip` kind survives in music_votes and its
 * CHECK constraint on purpose — if the collective version is ever wanted back,
 * the storage is still there and only the action changes.
 */
export type NowPlaying = QueueTrack;

export interface PlayerStatus {
  /** Is a speaker page actually open and beating? */
  online: boolean;
  isPaused: boolean;
  hostName: string | null;
  lastBeatAt: Date | null;
  /** Where the track is, as of the last heartbeat. Null when nothing's on. */
  positionSeconds: number | null;
  durationSeconds: number | null;
  /** Seconds since that reading, so a screen can interpolate from it. */
  beatAgeSeconds: number | null;
}

/** The IST calendar day, as YYYY-MM-DD. The jukebox's day boundary. */
export function istDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Two correlated subqueries rather than a GROUP BY join. At this scale the
// planner turns them into the same thing, and it keeps the row shape flat so
// the page doesn't have to re-stitch counts onto tracks.
function boostCountSql() {
  return sql<number>`(select count(*)::int from music_votes v
                      where v.track_id = ${musicTracks.id} and v.kind = 'boost')`;
}
function myVoteSql(userId: string, kind: "boost" | "skip") {
  return sql<boolean>`exists (select 1 from music_votes v
                              where v.track_id = ${musicTracks.id}
                                and v.kind = ${kind}
                                and v.user_id = ${userId})`;
}

const BASE_COLUMNS = {
  id: musicTracks.id,
  videoId: musicTracks.videoId,
  title: musicTracks.title,
  channelTitle: musicTracks.channelTitle,
  durationSeconds: musicTracks.durationSeconds,
  thumbnailUrl: musicTracks.thumbnailUrl,
  addedById: musicTracks.addedById,
  addedByName: users.name,
  createdAt: musicTracks.createdAt,
};

/**
 * The queue, in the order it will actually play.
 *
 * Boosts first, then oldest-waiting. See rule 2 above for why the tiebreak
 * matters more than it looks.
 */
export async function getQueue(meId: string, limit = 50): Promise<QueueTrack[]> {
  const db = getDb();
  const rows = await db
    .select({
      ...BASE_COLUMNS,
      boosts: boostCountSql(),
      boostedByMe: myVoteSql(meId, "boost"),
    })
    .from(musicTracks)
    .leftJoin(users, eq(musicTracks.addedById, users.id))
    .where(eq(musicTracks.status, "queued"))
    .orderBy(desc(boostCountSql()), asc(musicTracks.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    boosts: Number(r.boosts) || 0,
    boostedByMe: Boolean(r.boostedByMe),
    isMine: r.addedById === meId,
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
  }));
}

export async function getNowPlaying(meId: string): Promise<NowPlaying | null> {
  const db = getDb();
  const [row] = await db
    .select({
      ...BASE_COLUMNS,
      boosts: boostCountSql(),
      boostedByMe: myVoteSql(meId, "boost"),
    })
    .from(musicTracks)
    .leftJoin(users, eq(musicTracks.addedById, users.id))
    .where(eq(musicTracks.status, "playing"))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    boosts: Number(row.boosts) || 0,
    boostedByMe: Boolean(row.boostedByMe),
    isMine: row.addedById === meId,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
  };
}

export async function getPlayerStatus(): Promise<PlayerStatus> {
  const db = getDb();
  const [row] = await db
    .select({
      lastBeatAt: musicPlayerState.lastBeatAt,
      isPaused: musicPlayerState.isPaused,
      hostName: users.name,
      positionSeconds: musicPlayerState.positionSeconds,
      durationSeconds: musicPlayerState.durationSeconds,
    })
    .from(musicPlayerState)
    .leftJoin(users, eq(musicPlayerState.hostUserId, users.id))
    .where(eq(musicPlayerState.id, "office"))
    .limit(1);

  const beat = row?.lastBeatAt ? new Date(row.lastBeatAt) : null;
  const online = Boolean(beat && Date.now() - beat.getTime() < HEARTBEAT_STALE_MS);
  return {
    online,
    isPaused: Boolean(row?.isPaused),
    hostName: row?.hostName ?? null,
    lastBeatAt: beat,
    // Only meaningful while something is actually connected. A stale position
    // from an hour ago would drive a progress bar that looks live and isn't.
    positionSeconds: online ? (row?.positionSeconds ?? null) : null,
    durationSeconds: online ? (row?.durationSeconds ?? null) : null,
    beatAgeSeconds: online && beat ? Math.max(0, (Date.now() - beat.getTime()) / 1000) : null,
  };
}

/** How many tracks this person already has waiting. Drives the cap. */
export async function queuedCountFor(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(musicTracks)
    .where(and(eq(musicTracks.addedById, userId), eq(musicTracks.status, "queued")));
  return Number(row?.n) || 0;
}

/**
 * Retire whatever is playing and start the next thing, in one step.
 *
 * The UPDATE that claims the next track carries its own `not exists` guard, so
 * two player pages racing produce one winner and one no-op rather than two
 * songs. The database's partial unique index is the backstop if even that
 * loses; belt and braces, because the failure is audible.
 */
export async function advance(outcome: "played" | "skipped" = "played"): Promise<QueueTrack | null> {
  const db = getDb();
  const now = new Date();

  await db
    .update(musicTracks)
    .set({ status: outcome, playedAt: now, playDay: istDay(now) })
    .where(eq(musicTracks.status, "playing"));

  // Pick the front of the queue by exactly the rules getQueue() renders, so
  // what plays next is always what the team was looking at.
  //
  // The `not exists` guard is necessary but NOT sufficient. Under READ
  // COMMITTED the subquery sees a snapshot taken at statement start, so two
  // advances racing — a second player page, or a skip hitting its threshold at
  // the same moment a track ends — can both pass it. The partial unique index
  // from 0031 is what actually decides the winner, and the loser arrives here
  // as a constraint violation rather than a return value. Catching it is the
  // difference between "someone else got there first" and an error card in
  // front of whoever happened to click skip.
  let claimedId: string | undefined;
  try {
    const claimed = await db.execute(sql`
      update music_tracks set status = 'playing'
      where id = (
        select t.id from music_tracks t
        left join (
          select track_id, count(*)::int as boosts
          from music_votes where kind = 'boost' group by track_id
        ) v on v.track_id = t.id
        where t.status = 'queued'
        order by coalesce(v.boosts, 0) desc, t.created_at asc
        limit 1
      )
      and not exists (select 1 from music_tracks p where p.status = 'playing')
      returning id
    `);
    const rows = Array.isArray(claimed) ? claimed : ((claimed as { rows?: unknown[] })?.rows ?? []);
    claimedId = (rows[0] as { id?: string } | undefined)?.id;
  } catch (e) {
    // 23505 = unique_violation. We lost the race; whatever the winner started
    // is the right answer, so report that rather than nothing.
    const code = (e as { code?: string }).code;
    if (code !== "23505") throw e;
    log.info("music.claim_race_lost");
    const [winner] = await db
      .select({ id: musicTracks.id })
      .from(musicTracks)
      .where(eq(musicTracks.status, "playing"))
      .limit(1);
    claimedId = winner?.id;
  }

  if (!claimedId) {
    log.info("music.queue_empty");
    return null;
  }

  const [row] = await db
    .select({ ...BASE_COLUMNS, boosts: boostCountSql() })
    .from(musicTracks)
    .leftJoin(users, eq(musicTracks.addedById, users.id))
    .where(eq(musicTracks.id, claimedId))
    .limit(1);

  if (!row) return null;
  log.info("music.now_playing", { trackId: row.id, title: row.title.slice(0, 60) });

  return {
    ...row,
    boosts: Number(row.boosts) || 0,
    boostedByMe: false,
    isMine: false,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
  };
}

export interface MyTrack {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  /** How many times this person has put it on. A quiet measure of a favourite. */
  timesAdded: number;
  /** Already queued or playing right now, so it can't be added again yet. */
  active: boolean;
}

/**
 * The songs this person has put on before, newest first.
 *
 * Their history IS their library — there is no separate favourites list to
 * keep in sync, and a song someone has queued three times has already told us
 * it's a favourite without anyone pressing a star. Grouped by video so the
 * same track added five times is one entry rather than five.
 *
 * `active` marks anything currently queued or playing (by anyone), because
 * offering a one-tap "add again" for something already in the queue would
 * produce a refusal the person could have been spared.
 */
export async function myRecentTracks(userId: string, limit = 14): Promise<MyTrack[]> {
  const db = getDb();

  const result = await db.execute(sql`
    select
      t.video_id,
      max(t.created_at)                                        as last_added,
      count(*)::int                                            as times_added,
      (array_agg(t.title          order by t.created_at desc))[1] as title,
      (array_agg(t.channel_title  order by t.created_at desc))[1] as channel_title,
      (array_agg(t.thumbnail_url  order by t.created_at desc))[1] as thumbnail_url,
      (array_agg(t.duration_seconds order by t.created_at desc))[1] as duration_seconds,
      exists (
        select 1 from music_tracks a
        where a.video_id = t.video_id and a.status in ('queued', 'playing')
      )                                                        as active
    from music_tracks t
    where t.added_by_id = ${userId}
    group by t.video_id
    order by last_added desc
    limit ${limit}
  `);

  // postgres-js hands back an array-like; node-postgres wraps it in { rows }.
  const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] })?.rows ?? [])) as Array<
    Record<string, unknown>
  >;

  return rows.map((r) => ({
    videoId: String(r.video_id),
    title: String(r.title ?? "Untitled"),
    channelTitle: r.channel_title == null ? null : String(r.channel_title),
    thumbnailUrl: r.thumbnail_url == null ? null : String(r.thumbnail_url),
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    timesAdded: Number(r.times_added) || 1,
    active: Boolean(r.active),
  }));
}

export interface DayPlaylist {
  day: string;
  tracks: Array<{
    id: string;
    videoId: string;
    title: string;
    channelTitle: string | null;
    addedByName: string | null;
    playedAt: Date | null;
    skipped: boolean;
  }>;
}

/**
 * The daily snapshot — a GROUP BY, not a cron job.
 *
 * Because play_day is stamped at the moment a track finishes, this can never
 * disagree with what was actually played, cannot be missed by a server that
 * was down at midnight, and needed no scheduled job to produce it.
 */
export async function playlistsByDay(days = 7): Promise<DayPlaylist[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: musicTracks.id,
      videoId: musicTracks.videoId,
      title: musicTracks.title,
      channelTitle: musicTracks.channelTitle,
      addedByName: users.name,
      playedAt: musicTracks.playedAt,
      playDay: musicTracks.playDay,
      status: musicTracks.status,
    })
    .from(musicTracks)
    .leftJoin(users, eq(musicTracks.addedById, users.id))
    .where(sql`${musicTracks.playDay} is not null`)
    .orderBy(desc(musicTracks.playDay), desc(musicTracks.playedAt))
    .limit(days * 60);

  const byDay = new Map<string, DayPlaylist>();
  for (const r of rows) {
    const day = String(r.playDay);
    if (!byDay.has(day)) {
      if (byDay.size >= days) continue;
      byDay.set(day, { day, tracks: [] });
    }
    byDay.get(day)!.tracks.push({
      id: r.id,
      videoId: r.videoId,
      title: r.title,
      channelTitle: r.channelTitle,
      addedByName: r.addedByName,
      playedAt: r.playedAt ? new Date(r.playedAt) : null,
      skipped: r.status === "skipped",
    });
  }
  return Array.from(byDay.values());
}

/** A friendly day label — "Today", "Yesterday", else the date. */
export function dayLabel(day: string): string {
  const today = istDay();
  if (day === today) return "Today";
  const y = new Date(`${today}T00:00:00+05:30`);
  y.setDate(y.getDate() - 1);
  if (day === istDay(y)) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T12:00:00+05:30`));
}


export interface DjRow {
  id: string;
  name: string;
  played: number;
  boosts: number;
  rank: number;
  isMe: boolean;
}
export interface DjStats {
  myPlayed: number;
  myBoosts: number;
  myRank: number | null;
  topTrack: { title: string; boosts: number } | null;
  board: DjRow[];
}

/**
 * Who's actually filling the room.
 *
 * Ranked by BOOSTS RECEIVED, not by songs queued. Queuing is free and
 * therefore meaningless as a measure; a boost is somebody else stopping what
 * they were doing to say they liked your choice. Ranking by volume would just
 * crown whoever pastes the most links.
 *
 * This is a leaderboard about music taste, which is the one kind that's
 * harmless — nobody's standing, salary or review is anywhere near it.
 */
export async function getDjStats(meId: string): Promise<DjStats> {
  const db = getDb();

  const res = await db.execute(sql`
    select u.id, u.name,
      count(distinct t.id) filter (where t.status in ('played','skipped'))::int as played,
      count(v.id) filter (where v.kind = 'boost')::int as boosts
    from users u
    join music_tracks t on t.added_by_id = u.id
    left join music_votes v on v.track_id = t.id
    where u.is_active = true
    group by u.id, u.name
    having count(distinct t.id) > 0
    order by boosts desc, played desc, u.name asc
  `);

  const board: DjRow[] = rowsOfLocal(res).map((r, i) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    played: Number(r.played) || 0,
    boosts: Number(r.boosts) || 0,
    rank: i + 1,
    isMe: String(r.id) === meId,
  }));

  const mine = board.find((b) => b.isMe) ?? null;

  const topRes = await db.execute(sql`
    select t.title,
      (select count(*)::int from music_votes v where v.track_id = t.id and v.kind = 'boost') as boosts
    from music_tracks t
    where t.added_by_id = ${meId}
    order by boosts desc, t.created_at desc
    limit 1
  `);
  const top = rowsOfLocal(topRes)[0];

  return {
    myPlayed: mine?.played ?? 0,
    myBoosts: mine?.boosts ?? 0,
    myRank: mine?.rank ?? null,
    topTrack: top && Number(top.boosts) > 0
      ? { title: String(top.title), boosts: Number(top.boosts) }
      : null,
    board,
  };
}

function rowsOfLocal(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const r = (result as { rows?: unknown[] })?.rows;
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

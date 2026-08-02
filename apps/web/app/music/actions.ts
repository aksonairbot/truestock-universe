// apps/web/app/music/actions.ts
//
// Everything the jukebox lets a person do. The rules themselves live in
// lib/music.ts; this is where they meet a form.
//
// All of these return {ok,error} rather than throwing, for the reason recorded
// across this codebase: Next redacts thrown server-action messages in
// production, so "you already have 3 songs waiting" would reach the person as
// a full-page crash card. On a fun feature that's worse than on a serious one
// — nobody files a bug about the office jukebox, they just quietly stop using
// it and you never find out why.

"use server";

import { revalidatePath } from "next/cache";
import { getDb, musicTracks, musicVotes, musicPlayerState, eq, and, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import { parseYouTubeId, fetchTrackMeta, searchYouTube, type SearchHit } from "@/lib/youtube";
import {
  advance,
  canControlPlayback,
  queuedCountFor,
  MAX_QUEUED_PER_PERSON,
  MAX_TRACK_SECONDS,
} from "@/lib/music";
import { log } from "@/lib/log";
import { ok, fail, type ActionResult } from "@/lib/action-result";

function refresh() {
  revalidatePath("/music");
  revalidatePath("/music/player");
}

/**
 * Add a track. Accepts a pasted link in any YouTube form, or a video id picked
 * from search results.
 */
export async function addTrack(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  const input = ((formData.get("url") as string) ?? "").trim();
  if (!input) return fail("Paste a YouTube link, or search for something.");

  const videoId = parseYouTubeId(input);
  if (!videoId) {
    return fail(
      input.includes("spotify.com")
        ? "Spotify links can't play here — Spotify doesn't allow it in a company tool. Find the track on YouTube and paste that instead."
        : "That doesn't look like a YouTube link. A watch, youtu.be, YouTube Music or Shorts link all work.",
    );
  }

  const db = getDb();

  // Already in the queue, or playing right now. Two people reaching for the
  // same song is a nice moment, not an error — but two copies in the queue is
  // just a bug you have to clean up.
  const [dupe] = await db
    .select({ id: musicTracks.id, status: musicTracks.status, title: musicTracks.title })
    .from(musicTracks)
    .where(and(eq(musicTracks.videoId, videoId), sql`${musicTracks.status} in ('queued','playing')`))
    .limit(1);
  if (dupe) {
    return fail(
      dupe.status === "playing"
        ? "That's playing right now."
        : "That's already in the queue — give it a boost instead.",
    );
  }

  const mine = await queuedCountFor(me.id);
  if (mine >= MAX_QUEUED_PER_PERSON) {
    return fail(
      `You've got ${mine} songs waiting, which is the limit. It keeps one person from owning the afternoon — add another once one of yours has played.`,
    );
  }

  const meta = await fetchTrackMeta(videoId);
  if (!meta) {
    return fail("YouTube wouldn't tell me anything about that video — it may be private, age-restricted or deleted.");
  }

  // Only enforceable when a YOUTUBE_API_KEY gave us a duration. Without one,
  // the skip vote is the backstop.
  if (meta.durationSeconds && meta.durationSeconds > MAX_TRACK_SECONDS) {
    const mins = Math.round(meta.durationSeconds / 60);
    return fail(
      `That's ${mins} minutes long. Anything over ${MAX_TRACK_SECONDS / 60} isn't a song, it's a takeover — pick a single track.`,
    );
  }

  try {
    await db.insert(musicTracks).values({
      videoId: meta.videoId,
      title: meta.title,
      channelTitle: meta.channelTitle,
      durationSeconds: meta.durationSeconds,
      thumbnailUrl: meta.thumbnailUrl,
      addedById: me.id,
      status: "queued",
    });
  } catch (e) {
    log.error("music.add_failed", { videoId, error: (e as Error).message });
    return fail("The database wouldn't take that one. The details are in the server log.");
  }

  log.info("music.added", { videoId, by: me.id, title: meta.title.slice(0, 60) });
  refresh();
  return ok;
}

/**
 * Boost, or take a boost back. A toggle rather than an add-only counter,
 * because changing your mind about a song is normal and having to live with a
 * misclick for the next hour is not.
 */
export async function boostTrack(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  const trackId = ((formData.get("trackId") as string) ?? "").trim();
  if (!trackId) return fail("That song seems to have gone. Reload the page.");

  const db = getDb();
  const [track] = await db
    .select({ id: musicTracks.id, status: musicTracks.status })
    .from(musicTracks)
    .where(eq(musicTracks.id, trackId))
    .limit(1);
  if (!track) return fail("That song is no longer in the queue.");
  if (track.status !== "queued") return fail("That one's already had its turn.");

  const [existing] = await db
    .select({ id: musicVotes.id })
    .from(musicVotes)
    .where(and(eq(musicVotes.trackId, trackId), eq(musicVotes.userId, me.id), eq(musicVotes.kind, "boost")))
    .limit(1);

  if (existing) {
    await db.delete(musicVotes).where(eq(musicVotes.id, existing.id));
  } else {
    // The unique index makes a double-click a no-op rather than two votes.
    await db
      .insert(musicVotes)
      .values({ trackId, userId: me.id, kind: "boost" })
      .onConflictDoNothing();
  }

  refresh();
  return ok;
}

/**
 * Move on from what's playing.
 *
 * This is PLAYBACK CONTROL, so it belongs to admins and managers — skipping
 * changes what a whole room is hearing right now, which is a different act
 * from putting a song forward.
 *
 * The one exception is your own track. Withdrawing a choice you made yourself
 * is not power over anyone else, and taking it away would mean queueing
 * something you immediately regret leaves you having to ask a manager.
 */
export async function skipVote(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  const db = getDb();

  const [playing] = await db
    .select({ id: musicTracks.id, addedById: musicTracks.addedById, title: musicTracks.title })
    .from(musicTracks)
    .where(eq(musicTracks.status, "playing"))
    .limit(1);
  if (!playing) return fail("Nothing's playing right now.");

  const isMine = playing.addedById === me.id;
  if (!isMine && !canControlPlayback(me)) {
    return fail("Only admins and managers can skip. You can always skip a song you added yourself.");
  }

  await advance("skipped");
  log.info("music.skipped", { trackId: playing.id, by: me.id, own: isMine });
  refresh();
  return ok;
}

/** Take your own track out of the queue. Admins and managers can remove any. */
export async function removeTrack(formData: FormData): Promise<ActionResult> {
  const me = await getCurrentUser();
  const trackId = ((formData.get("trackId") as string) ?? "").trim();
  if (!trackId) return fail("That song seems to have gone. Reload the page.");

  const db = getDb();
  const [track] = await db
    .select({ id: musicTracks.id, addedById: musicTracks.addedById, status: musicTracks.status })
    .from(musicTracks)
    .where(eq(musicTracks.id, trackId))
    .limit(1);
  if (!track) return ok; // Already gone. Nothing to complain about.
  if (track.status !== "queued") return fail("That one's already had its turn.");

  if (track.addedById !== me.id && !isPrivileged(me)) {
    return fail("You can only remove songs you added.");
  }

  await db.delete(musicTracks).where(eq(musicTracks.id, trackId));
  refresh();
  return ok;
}

/** Search. Returns [] when no API key is set — the paste path always works. */
export async function searchTracks(query: string): Promise<SearchHit[]> {
  await getCurrentUser(); // A server action is a public endpoint. Gate it.
  return searchYouTube(query, 5);
}

// ---------------------------------------------------------------------------
// Player-page actions. Called by whichever machine is driving the speaker.
// ---------------------------------------------------------------------------

/**
 * "I'm still here." Also claims host, so the queue page can say who's driving.
 * Called every few seconds by the open player page.
 */
export async function playerBeat(position?: number, duration?: number): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  // A server action is a public endpoint. The speaker page is admin/manager
  // only, but that is a route guard, and a route guard stops navigation, not
  // a POST. Without this line anyone could claim to be the office speaker.
  if (!canControlPlayback(me)) return { ok: false };

  const db = getDb();
  const clean = (n: number | undefined) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 86_400 ? Math.floor(n) : null;

  await db
    .update(musicPlayerState)
    .set({
      lastBeatAt: new Date(),
      hostUserId: me.id,
      positionSeconds: clean(position),
      durationSeconds: clean(duration),
      updatedAt: new Date(),
    })
    .where(eq(musicPlayerState.id, "office"));
  return { ok: true };
}

/**
 * The current track ended (or the host pressed next). Retire it and start the
 * next one. Idempotent by construction: advance() only claims when nothing is
 * playing, so a double-fire from the player's state events is harmless.
 */
export async function playerAdvance(outcome: "played" | "skipped" = "played"): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!canControlPlayback(me)) return fail("Only admins and managers can control playback.");
  await advance(outcome);
  refresh();
  return ok;
}

/** Pause the room. Distinct from "no speaker connected", which is not a choice. */
export async function togglePause(): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!canControlPlayback(me)) return fail("Only admins and managers can control playback.");
  const db = getDb();
  await db
    .update(musicPlayerState)
    .set({ isPaused: sql`not is_paused`, updatedAt: new Date() })
    .where(eq(musicPlayerState.id, "office"));
  refresh();
  return ok;
}

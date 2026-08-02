// apps/web/app/api/music/state/route.ts
//
// The whole jukebox in one poll.
//
// WHY POLLING AND NOT SOCKETS
// The repo declares socket.io-client but doesn't have it installed — that's
// the long-standing TS2307 in the typecheck, and it means the chat module's
// realtime path is already degraded. Building the jukebox on top of that would
// inherit a broken dependency and make the speaker stop mid-song whenever the
// socket dropped. Eighteen people polling one indexed query every few seconds
// is nothing, and it fails softly: a missed poll is a stale second, not silence
// in the office. This mirrors /api/sidebar-badges, which works the same way.
//
// One payload serves both screens — the queue page everyone drives from and
// the player page on the speaker machine — so the two can never render
// disagreeing versions of what's playing.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getQueue, getNowPlaying, getPlayerStatus, queuedCountFor, myRecentTracks,
  canControlPlayback, MAX_QUEUED_PER_PERSON,
} from "@/lib/music";
import { isYouTubeConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const me = await getCurrentUser();
    // The poll honours it too, or the controls reappear underneath you four
    // seconds after opening the preview.
    const asMember = new URL(request.url).searchParams.get("as") === "member";

    const [now, queue, player, myQueued, mine] = await Promise.all([
      getNowPlaying(me.id),
      getQueue(me.id, 40),
      getPlayerStatus(),
      queuedCountFor(me.id),
      myRecentTracks(me.id, 14),
    ]);

    return NextResponse.json(
      {
        now,
        queue,
        player,
        mine,
        myQueued,
        maxPerPerson: MAX_QUEUED_PER_PERSON,
        searchEnabled: isYouTubeConfigured(),
        // Drives which buttons render. The actions check this themselves too —
        // this field is for the UI's benefit, never the security boundary.
        // ANDed, never ORed: preview can only take capability away.
        canControl: canControlPlayback(me) && !asMember,
      },
      // no-store: a cached jukebox is a jukebox showing the wrong song.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Never 500 a poll loop. An empty-but-valid payload lets the page keep
    // rendering its last good state instead of flashing an error every 4s.
    return NextResponse.json(
      {
        now: null,
        queue: [],
        player: {
          online: false, isPaused: false, hostName: null,
          positionSeconds: null, durationSeconds: null, beatAgeSeconds: null,
        },
        mine: [],
        myQueued: 0,
        maxPerPerson: MAX_QUEUED_PER_PERSON,
        searchEnabled: false,
        // Fail closed: a poll that errored must not hand someone controls.
        canControl: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}

// apps/web/app/music/player/page.tsx
//
// The speaker machine's page. Deliberately its own route rather than a mode of
// /music: it gets left open for hours on a machine nobody is looking at, and
// it should not be re-rendering a queue UI, polling badges, or holding a
// sidebar open while it does that.

import { getCurrentUser } from "@/lib/auth";
import { getQueue, getNowPlaying, getPlayerStatus, canControlPlayback } from "@/lib/music";
import { PlayerClient } from "./player-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Speaker · SeekPeak",
  description: "The machine that plays the office queue",
};

/**
 * One route, two modes.
 *
 * It used to redirect anyone without control straight back to /music, which
 * meant most of the team could never see the thing at all — and seeing it is
 * the fun part. Now they get the same window in VIEWER mode: same video, same
 * lights, muted and synced to the speaker, no transport.
 *
 * `?as=member` lets someone who does have control look at the viewer version.
 * ANDed with the real permission, so it can only ever remove capability.
 */
export default async function MusicPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const me = await getCurrentUser();
  const sp = await searchParams;
  const mode: "speaker" | "viewer" =
    canControlPlayback(me) && sp.as !== "member" ? "speaker" : "viewer";

  const [now, queue, player] = await Promise.all([
    getNowPlaying(me.id),
    getQueue(me.id, 10),
    getPlayerStatus(),
  ]);

  return (
    <PlayerClient
      mode={mode}
      initial={{
        now: now
          ? {
              id: now.id,
              videoId: now.videoId,
              title: now.title,
              channelTitle: now.channelTitle,
              addedByName: now.addedByName,
            }
          : null,
        queue: queue.map((t) => ({
          id: t.id,
          title: t.title,
          channelTitle: t.channelTitle,
          addedByName: t.addedByName,
          durationSeconds: t.durationSeconds,
        })),
        player,
      }}
    />
  );
}

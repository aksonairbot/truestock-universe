// apps/web/app/music/player/page.tsx
//
// The speaker machine's page. Deliberately its own route rather than a mode of
// /music: it gets left open for hours on a machine nobody is looking at, and
// it should not be re-rendering a queue UI, polling badges, or holding a
// sidebar open while it does that.

import { getCurrentUser } from "@/lib/auth";
import { getQueue, getNowPlaying, getPlayerStatus } from "@/lib/music";
import { PlayerClient } from "./player-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Speaker · SeekPeak",
  description: "The machine that plays the office queue",
};

export default async function MusicPlayerPage() {
  const me = await getCurrentUser();

  const [now, queue, player] = await Promise.all([
    getNowPlaying(me.id),
    getQueue(me.id, 10),
    getPlayerStatus(),
  ]);

  return (
    <PlayerClient
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
        })),
        player,
      }}
    />
  );
}

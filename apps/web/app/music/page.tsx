// apps/web/app/music/page.tsx
//
// The jukebox everyone drives. Server-renders the first frame so the queue is
// there instantly, then hands over to a client component that polls — no
// spinner on load, no waiting for a fetch before you can see what's playing.
//
// Below the live queue: what the office actually listened to, by day. That
// history is the quiet payoff of the whole feature. A queue is fun for an
// afternoon; "here's what this place sounded like in August" is the thing
// people will still open in six months.

import { getCurrentUser } from "@/lib/auth";
import {
  getQueue,
  getNowPlaying,
  getPlayerStatus,
  queuedCountFor,
  playlistsByDay,
  dayLabel,
  MAX_QUEUED_PER_PERSON,
} from "@/lib/music";
import { isYouTubeConfigured } from "@/lib/youtube";
import { Jukebox } from "./jukebox";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Music · SeekPeak",
  description: "The office jukebox",
};

export default async function MusicPage() {
  const me = await getCurrentUser();

  const [now, queue, player, myQueued, days] = await Promise.all([
    getNowPlaying(me.id),
    getQueue(me.id, 40),
    getPlayerStatus(),
    queuedCountFor(me.id),
    playlistsByDay(7),
  ]);

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Music</h1>
          <p className="page-sub">
            Anyone can queue a song. Whatever gets the most boosts plays next.
          </p>
        </div>
      </div>

      <div className="jb-layout">
        <Jukebox
          initial={{
            now,
            queue,
            player,
            myQueued,
            maxPerPerson: MAX_QUEUED_PER_PERSON,
            searchEnabled: isYouTubeConfigured(),
          }}
        />

        <aside className="jb-history">
          <div className="jb-history-h">What we listened to</div>
          {days.length === 0 ? (
            <p className="jb-empty">
              Nothing yet. Once songs start playing they&rsquo;ll collect here, a day at a time.
            </p>
          ) : (
            days.map((d) => (
              <section key={d.day} className="jb-day">
                <div className="jb-day-h">
                  {dayLabel(d.day)}
                  <span className="jb-day-n">{d.tracks.length}</span>
                </div>
                <ul className="jb-day-list">
                  {d.tracks.map((t) => (
                    <li key={t.id} className={`jb-day-row ${t.skipped ? "was-skipped" : ""}`}>
                      <a
                        href={`https://www.youtube.com/watch?v=${t.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="jb-day-title"
                        title={t.title}
                      >
                        {t.title}
                      </a>
                      <span className="jb-day-by">
                        {t.addedByName ?? "—"}
                        {t.skipped ? " · skipped" : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}

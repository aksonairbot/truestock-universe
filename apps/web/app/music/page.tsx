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
  myRecentTracks,
  playlistsByDay,
  dayLabel,
  canControlPlayback,
  getDjStats,
  MAX_QUEUED_PER_PERSON,
} from "@/lib/music";
import { isYouTubeConfigured } from "@/lib/youtube";
import { Jukebox } from "./jukebox";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Music · SeekPeak",
  description: "The office jukebox",
};

/**
 * `?as=member` renders the page as someone with no playback control.
 *
 * This exists because its absence cost real time: the Watch along button
 * reads differently for admins and members, and with no way to look, the only
 * options were guessing or asking someone. The same question applies to the
 * standing card and will keep coming up.
 *
 * SAFE BY CONSTRUCTION — ANDed with the real permission, so it can only ever
 * REMOVE capability. A member adding ?as=member gets exactly what they had,
 * and the server actions enforce the real permission regardless of what any
 * page chose to render.
 */
export default async function MusicPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const me = await getCurrentUser();
  const asMember = (await searchParams).as === "member";
  const canControl = canControlPlayback(me) && !asMember;

  const [now, queue, player, myQueued, mine, days, dj] = await Promise.all([
    getNowPlaying(me.id),
    getQueue(me.id, 40),
    getPlayerStatus(),
    queuedCountFor(me.id),
    myRecentTracks(me.id, 14),
    playlistsByDay(7),
    getDjStats(me.id),
  ]);

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Music</h1>
          <p className="page-sub">
            Anyone can queue a song and boost what they want next. Whatever has the most boosts plays first.
          </p>
        </div>
      </div>

      <div className="jb-layout">
        <Jukebox
          initial={{
            now,
            queue,
            player,
            mine,
            myQueued,
            maxPerPerson: MAX_QUEUED_PER_PERSON,
            searchEnabled: isYouTubeConfigured(),
            canControl,
            // True only for someone who really has control and chose to look
            // without it — which is what keeps the exit affordance honest.
            previewing: asMember && canControlPlayback(me),
          }}
        />

        <aside className="jb-history">
          {/* Boosts received, not songs queued. Queuing is free; a boost is
              someone else stopping what they were doing to say they liked
              your choice. Ranking by volume would crown whoever pastes the
              most links. */}
          {dj.board.length > 0 ? (
            <section className="dj">
              <div className="dj-h">Selectors</div>
              <div className="dj-me">
                <div className="dj-stat">
                  <span className="dj-n">{dj.myBoosts}</span>
                  <span className="dj-l">boosts on your picks</span>
                </div>
                <div className="dj-stat">
                  <span className="dj-n">{dj.myPlayed}</span>
                  <span className="dj-l">of yours played</span>
                </div>
                {dj.myRank ? <span className="dj-rank">#{dj.myRank}</span> : null}
              </div>
              {dj.topTrack ? (
                <div className="dj-top">
                  Your most-boosted: <strong>{dj.topTrack.title}</strong> ({dj.topTrack.boosts})
                </div>
              ) : null}
              <ol className="dj-board">
                {dj.board.slice(0, 6).map((d, i) => (
                  <li key={d.id} className={`dj-r ${d.isMe ? "is-me" : ""}`} style={{ ["--i" as string]: String(i) }}>
                    <span className={`dj-p p${d.rank <= 3 ? d.rank : 0}`}>{d.rank}</span>
                    <span className="dj-name">{d.isMe ? "You" : d.name.split(/\s+/)[0]}</span>
                    <span className="dj-b">{d.boosts}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

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

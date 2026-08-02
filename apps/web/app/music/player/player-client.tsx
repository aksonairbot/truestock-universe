// apps/web/app/music/player/player-client.tsx
//
// THE SPEAKER, dressed as Winamp. One machine keeps this window open; everyone
// else drives it from /music.
//
// WHY IT LOOKS LIKE 1999
// Amit asked for the Winamp nostalgia, and it turns out to be the right shape
// for the job rather than just a joke: a small, dense, always-on-top console
// that sits in the corner of a screen nobody is actively using is exactly what
// Winamp was for. The chrome is the classic main window — beveled grey frame,
// black LCD strip, green bitmap-ish type, chunky transport row — with the
// playlist editor docked underneath.
//
// WHAT IS REAL AND WHAT IS DECORATION, stated plainly so nobody is misled
// later: the elapsed/total time, the volume slider and the transport buttons
// are all wired to the actual YouTube player. The spectrum analyser is NOT —
// an iframe is cross-origin, so its audio cannot be tapped by Web Audio and
// there is nothing to analyse. Those bars are ornament that runs while the
// track plays and freezes when it pauses. They are honest about being a mood,
// not a measurement.
//
// THREE CONSTRAINTS THAT DID NOT GO AWAY BECAUSE IT GOT PRETTY:
//
//   1. YOUTUBE'S REQUIRED MINIMUM FUNCTIONALITY. The embed must be at least
//      200×200, genuinely visible, and must NOT be obscured by overlays or
//      frames. So the video occupies the slot where Winamp put its
//      visualisation, at full size, and every piece of chrome sits ABOVE or
//      BELOW it — never across it. If you are ever tempted to float the LCD
//      strip over the video to make it look more like the real thing: that is
//      the line, and it is not a stylistic preference.
//
//   2. BROWSERS BLOCK AUTOPLAY WITH SOUND until a real gesture. The player
//      isn't created until someone presses the big button, because a room
//      that silently stays quiet is the worst possible failure here.
//
//   3. PLENTY OF MUSIC VIDEOS DISALLOW EMBEDDING. onError retires the track
//      and moves on, and says so, so whoever queued it finds out why.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playerBeat, playerAdvance, togglePause } from "../actions";

interface Now {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string | null;
  addedByName: string | null;
}
interface QueueRow {
  id: string;
  title: string;
  channelTitle: string | null;
  addedByName: string | null;
}
interface State {
  now: Now | null;
  queue: QueueRow[];
  player: { online: boolean; isPaused: boolean; hostName: string | null };
}

const POLL_MS = 4000;
const BEAT_MS = 8000;
const TICK_MS = 500;

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(v: number): void;
  getVolume(): number;
  destroy(): void;
}
declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    if (!document.getElementById("yt-iframe-api")) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const t = setInterval(() => {
      if (window.YT?.Player) { clearInterval(t); resolve(); }
    }, 300);
    setTimeout(() => clearInterval(t), 20_000);
  });
}

/** MM:SS, the way the green display did it. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PlayerClient({ initial }: { initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [started, setStarted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(0);
  const [volume, setVolume] = useState(80);
  const [playing, setPlaying] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<string | null>(null);
  const advancingRef = useRef(false);

  const refresh = useCallback(async (): Promise<State | null> => {
    try {
      const r = await fetch("/api/music/state", { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as State;
      setState(d);
      return d;
    } catch {
      return null;
    }
  }, []);

  const advanceNow = useCallback(
    async (outcome: "played" | "skipped") => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      try {
        await playerAdvance(outcome);
        await refresh();
      } finally {
        setTimeout(() => { advancingRef.current = false; }, 1200);
      }
    },
    [refresh],
  );

  // ---- heartbeat ----
  useEffect(() => {
    if (!started) return;
    // Carry the real position with the beat, so every other screen can draw an
    // honest progress bar instead of guessing from a start time.
    const beat = () => {
      let pos: number | undefined;
      let dur: number | undefined;
      try {
        pos = playerRef.current?.getCurrentTime();
        dur = playerRef.current?.getDuration();
      } catch { /* player briefly unusable while a video swaps in */ }
      void playerBeat(pos, dur).catch(() => {});
    };
    beat();
    const t = setInterval(beat, BEAT_MS);
    return () => clearInterval(t);
  }, [started]);

  // ---- the green display's clock, read from the real player ----
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        setElapsed(p.getCurrentTime() ?? 0);
        setTotal(p.getDuration() ?? 0);
        setPlaying(p.getPlayerState() === window.YT?.PlayerState.PLAYING);
      } catch {
        // The player object is briefly unusable while a video swaps in.
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [started]);

  // ---- don't let someone close the speaker mid-song by accident ----
  useEffect(() => {
    if (!started) return;
    const guard = (e: BeforeUnloadEvent) => {
      if (!playing) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [started, playing]);

  async function start() {
    setStarted(true);
    await loadYouTubeApi();
    if (!mountRef.current || !window.YT?.Player) {
      setNote("YouTube's player script didn't load. An ad blocker will do that.");
      return;
    }

    let s = state;
    if (!s.now) {
      await playerAdvance("played");
      s = (await refresh()) ?? s;
    }

    playerRef.current = new window.YT.Player(mountRef.current, {
      width: "100%",
      height: "100%",
      videoId: s.now?.videoId ?? "",
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1, autoplay: 1 },
      events: {
        onReady: () => {
          loadedRef.current = s.now?.videoId ?? null;
          playerRef.current?.setVolume(volume);
          playerRef.current?.playVideo();
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === window.YT?.PlayerState.ENDED) void advanceNow("played");
          setPlaying(e.data === window.YT?.PlayerState.PLAYING);
        },
        onError: () => {
          setNote(
            `"${s.now?.title ?? "That track"}" can't be embedded — plenty of official music videos block it. Skipping.`,
          );
          void advanceNow("skipped");
        },
      },
    });
  }

  // ---- stay in step with the server ----
  useEffect(() => {
    if (!started) return;
    const t = setInterval(async () => {
      const d = await refresh();
      if (!d || !playerRef.current) return;

      if (d.now && d.now.videoId !== loadedRef.current) {
        loadedRef.current = d.now.videoId;
        playerRef.current.loadVideoById(d.now.videoId);
        setNote(null);
        return;
      }
      // The queue.length check matters: without it an empty jukebox fires an
      // advance every 4 seconds forever, writing to the database on a loop to
      // discover there is still nothing to play.
      if (!d.now && d.queue.length > 0 && !advancingRef.current) {
        await advanceNow("played");
        return;
      }
      if (d.player.isPaused) playerRef.current.pauseVideo();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [started, refresh, advanceNow]);

  useEffect(() => () => { playerRef.current?.destroy?.(); }, []);

  function changeVolume(v: number) {
    setVolume(v);
    try { playerRef.current?.setVolume(v); } catch { /* swapping videos */ }
  }

  function playPause() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  const { now, queue, player } = state;

  // The marquee text. Winamp scrolled the whole lot as one line, and putting
  // the person's name IN it is the point — the jukebox should be visibly full
  // of colleagues, not anonymous tracks.
  const marquee = now
    ? `${now.title}${now.channelTitle ? `  ·  ${now.channelTitle}` : ""}  ·  queued by ${now.addedByName ?? "someone"}`
    : "no track loaded  ·  add something from the music page";

  if (!started) {
    return (
      <div className="wa-boot">
        <div className="wa-window wa-boot-win">
          <div className="wa-titlebar"><span className="wa-tb-text">SEEKPEAK JUKEBOX</span></div>
          <div className="wa-boot-body">
            <p className="wa-boot-p">
              Leave this window open on whatever&rsquo;s plugged into the speakers. It plays the queue and
              moves on by itself.
            </p>
            <button type="button" className="wa-bigbtn" onClick={start}>▶ START THE SPEAKER</button>
            <p className="wa-boot-note">
              Your browser needs this click before it will let a page make sound.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wa">
      {/* ---------------- main window ---------------- */}
      <div className="wa-window">
        <div className="wa-titlebar">
          <span className="wa-tb-text">SEEKPEAK JUKEBOX</span>
          <span className="wa-tb-host">{player.hostName ? `· ${player.hostName}` : ""}</span>
        </div>

        {/* The black LCD strip. Sits ABOVE the video, never across it. */}
        <div className="wa-lcd">
          <div className="wa-lcd-left">
            <div className="wa-time">{clock(elapsed)}</div>
            <div className="wa-total">{total > 0 ? clock(total) : "--:--"}</div>
          </div>

          <div className="wa-lcd-right">
            <div className="wa-marquee" aria-live="off">
              <span className={`wa-marquee-in ${playing ? "is-rolling" : ""}`}>
                {marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;{marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;
              </span>
            </div>
            <div className="wa-meters">
              {/* Ornament, not analysis — an iframe's audio is cross-origin
                  and cannot be tapped. See the note at the top of this file. */}
              <div className={`wa-viz ${playing ? "is-on" : ""}`} aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--b" as string]: String(i) }} />)}
              </div>
              <div className="wa-flags">
                <span className={playing ? "is-lit" : ""}>YOUTUBE</span>
                <span className={playing ? "is-lit" : ""}>STEREO</span>
              </div>
            </div>
          </div>
        </div>

        {/* THE VIDEO. Nothing may be positioned over this element. */}
        <div className="wa-screen">
          <div ref={mountRef} className="wa-embed" />
        </div>

        <div className="wa-transport">
          <button type="button" className="wa-btn" onClick={playPause} title={playing ? "Pause" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            className="wa-btn"
            onClick={() => { void togglePause().then(refresh); }}
            title="Pause for the whole room"
          >
            ■
          </button>
          <button
            type="button"
            className="wa-btn"
            onClick={() => { void advanceNow("skipped"); }}
            disabled={!now}
            title="Next track"
          >
            ▶▶|
          </button>

          <div className="wa-vol">
            <label className="wa-vol-label" htmlFor="wa-vol">VOL</label>
            <input
              id="wa-vol"
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="wa-slider"
            />
            <span className="wa-vol-n">{volume}</span>
          </div>
        </div>
      </div>

      {note ? <div className="wa-note">{note}</div> : null}

      {/* ---------------- playlist editor ---------------- */}
      <div className="wa-window wa-pledit">
        <div className="wa-titlebar">
          <span className="wa-tb-text">PLAYLIST</span>
          <span className="wa-tb-host">{queue.length} in queue</span>
        </div>
        <div className="wa-pl">
          {now ? (
            <div className="wa-pl-row is-current">
              <span className="wa-pl-n">1.</span>
              <span className="wa-pl-title">{now.title}</span>
              <span className="wa-pl-by">{now.addedByName ?? "—"}</span>
            </div>
          ) : null}
          {queue.length === 0 && !now ? (
            <div className="wa-pl-empty">queue is empty — add something from the music page</div>
          ) : (
            queue.slice(0, 12).map((t, i) => (
              <div key={t.id} className="wa-pl-row">
                <span className="wa-pl-n">{i + (now ? 2 : 1)}.</span>
                <span className="wa-pl-title">{t.title}</span>
                <span className="wa-pl-by">{t.addedByName ?? "—"}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

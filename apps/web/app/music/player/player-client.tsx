// apps/web/app/music/player/player-client.tsx
//
// THE SPEAKER. One machine keeps this page open; everyone else drives it from
// /music.
//
// THREE CONSTRAINTS SHAPED THIS, and none of them are optional:
//
//   1. YOUTUBE'S REQUIRED MINIMUM FUNCTIONALITY. The embedded player has to be
//      at least 200×200, genuinely visible, and must not have overlays or
//      frames obscuring it or its controls. So there is no hidden audio-only
//      player and nothing is ever drawn on top of the video — every control on
//      this page sits BESIDE or BELOW the embed, never over it. If you're
//      tempted to float a "now playing" card across the video, that's the rule
//      you'd be breaking.
//
//   2. BROWSERS BLOCK AUTOPLAY WITH SOUND until a real user gesture. A page
//      that silently fails to start is the worst possible bug here, because
//      the room just stays quiet and nobody knows why. So the player isn't
//      created at all until someone presses Start — that press IS the gesture,
//      and everything after it inherits permission.
//
//   3. PLENTY OF MUSIC VIDEOS DISALLOW EMBEDDING. This is common enough that
//      ignoring it would strand the queue on a dead track forever. onError
//      retires the track as skipped and moves on, and says so on screen so
//      whoever queued it learns why.

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
interface State {
  now: Now | null;
  queue: Array<{ id: string; title: string; channelTitle: string | null; addedByName: string | null }>;
  player: { online: boolean; isPaused: boolean; hostName: string | null };
}

const POLL_MS = 4000;
const BEAT_MS = 8000;

// The slice of the IFrame API we actually use. Typed by hand rather than
// pulling in @types/youtube for four methods.
interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
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

/** Load the IFrame API once, and resolve when it's genuinely ready. */
function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    const existing = document.getElementById("yt-iframe-api");
    if (!existing) {
      const s = document.createElement("script");
      s.id = "yt-iframe-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    // Belt and braces: if the callback never fires (adblock, offline), poll.
    const t = setInterval(() => {
      if (window.YT?.Player) {
        clearInterval(t);
        resolve();
      }
    }, 300);
    setTimeout(() => clearInterval(t), 20_000);
  });
}

export function PlayerClient({ initial }: { initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [started, setStarted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  // What the embed is actually showing, so we only reload on a real change.
  const loadedRef = useRef<string | null>(null);
  // advance() is idempotent server-side, but firing it twice from one ENDED
  // event would still churn; this keeps the client honest too.
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
        // Small gap so a burst of ENDED/state events can't chain-skip the
        // queue three tracks deep.
        setTimeout(() => { advancingRef.current = false; }, 1200);
      }
    },
    [refresh],
  );

  // ---- the heartbeat. "A speaker is running here." ----
  useEffect(() => {
    if (!started) return;
    const beat = () => { void playerBeat().catch(() => {}); };
    beat();
    const t = setInterval(beat, BEAT_MS);
    return () => clearInterval(t);
  }, [started]);

  // ---- start: create the player on the user's gesture ----
  async function start() {
    setStarted(true);
    await loadYouTubeApi();
    if (!mountRef.current || !window.YT?.Player) {
      setNote("YouTube's player script didn't load. An ad blocker will do that.");
      return;
    }

    // Claim a track if the room is idle, so pressing Start actually starts
    // something rather than showing an empty player.
    let s = state;
    if (!s.now) {
      await playerAdvance("played");
      s = (await refresh()) ?? s;
    }

    playerRef.current = new window.YT.Player(mountRef.current, {
      width: "100%",
      height: "100%",
      videoId: s.now?.videoId ?? "",
      playerVars: {
        // No related-video grid at the end, no channel branding, and the
        // native controls stay ON — hiding them would break the "controls
        // must be fully displayed" rule.
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        autoplay: 1,
      },
      events: {
        onReady: () => {
          loadedRef.current = s.now?.videoId ?? null;
          playerRef.current?.playVideo();
        },
        onStateChange: (e: { data: number }) => {
          if (e.data === window.YT?.PlayerState.ENDED) void advanceNow("played");
        },
        onError: () => {
          setNote(
            `"${s.now?.title ?? "That track"}" can't be embedded — a lot of official music videos block it. Skipping.`,
          );
          void advanceNow("skipped");
        },
      },
    });
  }

  // ---- keep the embed in step with the server ----
  useEffect(() => {
    if (!started) return;
    const t = setInterval(async () => {
      const d = await refresh();
      if (!d || !playerRef.current) return;

      // Someone skipped it, or a track finished elsewhere. Load the new one.
      if (d.now && d.now.videoId !== loadedRef.current) {
        loadedRef.current = d.now.videoId;
        playerRef.current.loadVideoById(d.now.videoId);
        setNote(null);
        return;
      }

      // The queue ran dry and then someone added something. The
      // queue.length check matters: without it an empty jukebox fires an
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

  useEffect(() => {
    return () => { playerRef.current?.destroy?.(); };
  }, []);

  const { now, queue, player } = state;

  return (
    <div className="jbp">
      {!started ? (
        <div className="jbp-start">
          <h1 className="jbp-start-h">Office speaker</h1>
          <p className="jbp-start-p">
            Leave this tab open on whatever&rsquo;s plugged into the speakers. It plays the queue and moves
            on by itself; everyone else adds and boosts songs from the Music page.
          </p>
          <button type="button" className="btn btn-primary" onClick={start}>
            Start the speaker
          </button>
          <p className="jbp-start-note">
            Your browser needs this click before it will let a page play sound — nothing will come out
            until you press it.
          </p>
        </div>
      ) : (
        <>
          {/* The embed. Nothing is ever drawn on top of this — see the note at
              the top of the file. Sized well above YouTube's 200px minimum. */}
          <div className="jbp-stage">
            <div ref={mountRef} className="jbp-embed" />
          </div>

          <div className="jbp-bar">
            <div className="jbp-meta">
              {now ? (
                <>
                  <div className="jbp-title">{now.title}</div>
                  <div className="jbp-sub">
                    {now.channelTitle}
                    {now.addedByName ? <> · added by {now.addedByName}</> : null}
                  </div>
                </>
              ) : (
                <div className="jbp-title jbp-idle">Queue&rsquo;s empty — add something from the Music page.</div>
              )}
            </div>
            <div className="jbp-controls">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { void togglePause().then(refresh); }}
              >
                {player.isPaused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { void advanceNow("skipped"); }}
                disabled={!now}
              >
                Next
              </button>
            </div>
          </div>

          {note ? <p className="jbp-note">{note}</p> : null}

          {queue.length > 0 ? (
            <ol className="jbp-next">
              {queue.slice(0, 5).map((t) => (
                <li key={t.id} className="jbp-next-row">
                  <span className="jbp-next-title">{t.title}</span>
                  {t.addedByName ? <span className="jbp-next-by">{t.addedByName}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </div>
  );
}

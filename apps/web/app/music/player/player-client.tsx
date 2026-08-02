// apps/web/app/music/player/player-client.tsx
//
// THE WINAMP WINDOW. One component, two modes.
//
//   SPEAKER (admins and managers) — drives the queue. Owns playback, sound,
//     the heartbeat, and advancing when a track ends. This is the machine
//     plugged into the office speakers.
//
//   VIEWER (everyone) — the same window, the same video, the same lights, but
//     no transport and no volume. It follows the speaker rather than leading
//     it, seeking back into sync whenever it drifts.
//
// WHY VIEWERS ARE MUTED
// Eighteen people each playing the same track a second out of step with the
// office speakers would be a mess, and Amit was explicit that sound control
// isn't theirs. Muting also happens to be what makes the viewer work at all:
// browsers permit autoplay only when muted, so a viewer window starts on its
// own with no button to press. Anyone who genuinely wants it in their own
// headphones — someone remote — can unmute through YouTube's own controls,
// which have to stay visible anyway. That gives them sound on their machine
// and still no control over the room.
//
// VIEWERS NEVER SEND A HEARTBEAT. The beat claims host, and a viewer claiming
// host would make the queue page announce the wrong person as driving. The
// action refuses them anyway (canControlPlayback), but the loop simply isn't
// started here — a refusal every eight seconds is not a design.
//
// YOUTUBE'S REQUIRED MINIMUM FUNCTIONALITY, unchanged by any of the above:
// the embed is >=200x200, genuinely visible, and NOTHING is drawn over it. The
// LCD sits above, the transport below. Skinning the chrome is fine; skinning
// across the video is not.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playerBeat, playerAdvance, setRoomPaused } from "../actions";

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
  durationSeconds: number | null;
}
interface State {
  now: Now | null;
  queue: QueueRow[];
  player: {
    online: boolean;
    isPaused: boolean;
    hostName: string | null;
    positionSeconds: number | null;
    durationSeconds: number | null;
    beatAgeSeconds: number | null;
  };
}

const POLL_MS = 4000;
const BEAT_MS = 8000;
const TICK_MS = 500;
/** Drift a viewer tolerates before seeking back to the speaker. */
const SYNC_SLOP_S = 4;

interface YTPlayer {
  loadVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackQuality(): string;
  setVolume(v: number): void;
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
    const t = setInterval(() => { if (window.YT?.Player) { clearInterval(t); resolve(); } }, 300);
    setTimeout(() => clearInterval(t), 20_000);
  });
}

function clock(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "hd1080" → "1080". Real data in the slot Winamp used for bitrate. */
function qualityLabel(q: string | null): string {
  if (!q) return "---";
  const map: Record<string, string> = {
    tiny: "144", small: "240", medium: "360", large: "480",
    hd720: "720", hd1080: "1080", hd1440: "1440", hd2160: "2160",
  };
  return map[q] ?? "---";
}

/** The classic ten-band labels. Decorative — see the EQ note in the JSX. */
const EQ_BANDS = ["60", "170", "310", "600", "1K", "3K", "6K", "12K", "14K", "16K"];

export function PlayerClient({ initial, mode }: { initial: State; mode: "speaker" | "viewer" }) {
  const isSpeaker = mode === "speaker";

  const [state, setState] = useState<State>(initial);
  const [started, setStarted] = useState(!isSpeaker); // viewers need no gesture
  const [note, setNote] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(0);
  const [volume, setVol] = useState(80);
  const [playing, setPlaying] = useState(false);
  const [quality, setQuality] = useState<string | null>(null);

  const playerRef = useRef<YTPlayer | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef<string | null>(null);
  const advancingRef = useRef(false);
  /** Last paused-state we pushed, so state changes don't spam the server. */
  const sentPausedRef = useRef<boolean | null>(null);

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
      if (!isSpeaker || advancingRef.current) return;
      advancingRef.current = true;
      try {
        await playerAdvance(outcome);
        await refresh();
      } finally {
        setTimeout(() => { advancingRef.current = false; }, 1200);
      }
    },
    [refresh, isSpeaker],
  );

  // ---- heartbeat: speaker only. A viewer claiming host would make the queue
  //      page name the wrong person as driving the room.
  useEffect(() => {
    if (!isSpeaker || !started) return;
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
  }, [isSpeaker, started]);

  // ---- the display's clock ----
  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        setElapsed(p.getCurrentTime() ?? 0);
        setTotal(p.getDuration() ?? 0);
        setPlaying(p.getPlayerState() === window.YT?.PlayerState.PLAYING);
        setQuality(p.getPlaybackQuality?.() ?? null);
      } catch { /* mid-swap */ }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [started]);

  // ---- don't let someone close the speaker mid-song by accident ----
  useEffect(() => {
    if (!isSpeaker || !started) return;
    const guard = (e: BeforeUnloadEvent) => {
      if (!playing) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isSpeaker, started, playing]);

  const build = useCallback(
    async (s: State) => {
      if (!mountRef.current || !window.YT?.Player) {
        setNote("YouTube's player script didn't load. An ad blocker will do that.");
        return;
      }
      playerRef.current = new window.YT.Player(mountRef.current, {
        width: "100%",
        height: "100%",
        videoId: s.now?.videoId ?? "",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: 1,
          // Muted is what lets a viewer window start with no gesture at all,
          // and what stops eighteen machines fighting the office speakers.
          mute: isSpeaker ? 0 : 1,
        },
        events: {
          onReady: () => {
            loadedRef.current = s.now?.videoId ?? null;
            if (isSpeaker) playerRef.current?.setVolume(volume);
            else playerRef.current?.mute();
            playerRef.current?.playVideo();
            // Join partway through, like walking into the room.
            const at = s.player.positionSeconds;
            if (!isSpeaker && at !== null) {
              playerRef.current?.seekTo(at + (s.player.beatAgeSeconds ?? 0), true);
            }
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === window.YT?.PlayerState.ENDED) void advanceNow("played");
            const isPlaying = e.data === window.YT?.PlayerState.PLAYING;
            setPlaying(isPlaying);

            // THE SPEAKER IS THE SOURCE OF TRUTH, and this is the line that
            // makes that real. Whoever is driving can pause with our button OR
            // with YouTube's own controls, which are on screen and which they
            // will absolutely use — so the pause has to be detected rather
            // than assumed. We push the state UP to the room; we never let the
            // room push back, or the admin's pause gets undone on the next
            // poll. That was the "admin can't pause" bug exactly.
            if (isSpeaker && (isPlaying || e.data === window.YT?.PlayerState.PAUSED)) {
              const paused = !isPlaying;
              if (sentPausedRef.current !== paused) {
                sentPausedRef.current = paused;
                void setRoomPaused(paused).catch(() => {});
              }
            }
          },
          onError: () => {
            if (isSpeaker) {
              setNote(`"${s.now?.title ?? "That track"}" can't be embedded — plenty of official music videos block it. Skipping.`);
              void advanceNow("skipped");
            } else {
              setNote("This one can't be embedded, so there's nothing to show. The speaker will move on.");
            }
          },
        },
      });
    },
    [advanceNow, isSpeaker, volume],
  );

  async function start() {
    setStarted(true);
    await loadYouTubeApi();
    let s = state;
    if (isSpeaker && !s.now) {
      await playerAdvance("played");
      s = (await refresh()) ?? s;
    }
    await build(s);
  }

  // Viewers build immediately — muted autoplay needs no gesture.
  useEffect(() => {
    if (isSpeaker) return;
    let cancelled = false;
    (async () => {
      await loadYouTubeApi();
      if (cancelled) return;
      await build(state);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaker]);

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

      if (isSpeaker) {
        // The queue.length check matters: without it an empty jukebox fires an
        // advance every 4 seconds forever, writing to the database on a loop.
        if (!d.now && d.queue.length > 0 && !advancingRef.current) {
          await advanceNow("played");
          return;
        }
        // Deliberately does NOTHING about play/pause. The speaker WRITES the
        // flag; re-applying it here would mean the poll fighting whoever is
        // standing at the machine. Viewers follow the flag — see below.
        return;
      }

      // Viewer: follow the speaker. Seeking on every poll would stutter, so
      // only correct once the drift is bigger than a listener would notice.
      const target = d.player.positionSeconds;
      if (target !== null) {
        const here = playerRef.current.getCurrentTime();
        const want = target + (d.player.beatAgeSeconds ?? 0);
        if (Math.abs(here - want) > SYNC_SLOP_S) playerRef.current.seekTo(want, true);
      }
      if (d.player.isPaused) playerRef.current.pauseVideo();
      else if (playerRef.current.getPlayerState() === window.YT?.PlayerState.PAUSED) {
        playerRef.current.playVideo();
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [started, refresh, advanceNow, isSpeaker]);

  useEffect(() => () => { playerRef.current?.destroy?.(); }, []);

  function changeVolume(v: number) {
    setVol(v);
    try { playerRef.current?.setVolume(v); } catch { /* mid-swap */ }
  }
  /**
   * Just move the player. The server flag follows from onStateChange, so this
   * button and YouTube's own controls behave identically — which they must,
   * because both are on screen and both get used.
   */
  function playPause() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }

  const { now, queue, player } = state;
  const marquee = now
    ? `${now.title}${now.channelTitle ? `  ·  ${now.channelTitle}` : ""}  ·  queued by ${now.addedByName ?? "someone"}`
    : "no track loaded  ·  add something from the music page";
  const pct = total > 0 ? Math.max(0, Math.min(100, (elapsed / total) * 100)) : 0;

  if (!started) {
    return (
      <div className="wa-boot">
        <div className="wa-win wa-boot-win">
          <div className="wa-tb"><i className="wa-grip" /><span className="wa-tb-name">WINAMP</span><i className="wa-grip" /></div>
          <div className="wa-boot-body">
            <p className="wa-boot-p">
              Leave this window open on whatever&rsquo;s plugged into the speakers. It plays the queue and
              moves on by itself.
            </p>
            <button type="button" className="wa-bigbtn" onClick={start}>▶ START THE SPEAKER</button>
            <p className="wa-boot-note">Your browser needs this click before it will let a page make sound.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wa">
      {/* ============ main window ============ */}
      <div className="wa-win">
        <div className="wa-tb">
          <i className="wa-grip" />
          <span className="wa-tb-name">WINAMP</span>
          <i className="wa-grip" />
          <span className="wa-tb-mode">{isSpeaker ? "SPEAKER" : "VIEW ONLY"}</span>
        </div>

        <div className="wa-body">
          {/* ---- the black display. Above the video, never across it. ---- */}
          <div className="wa-disp">
            <div className="wa-disp-l">
              <span className={`wa-ind ${playing ? "is-on" : ""}`} aria-hidden="true">▶</span>
              <span className="wa-clock">{clock(elapsed)}</span>
            </div>

            <div className="wa-disp-r">
              <div className="wa-marq">
                <span className={`wa-marq-in ${playing ? "is-rolling" : ""}`}>
                  {marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;{marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;
                </span>
              </div>
              <div className="wa-rates">
                {/* Winamp put bitrate and sample rate here. We don't have
                    either, so the slots carry what we DO know — the real
                    playback resolution — rather than a convincing invention. */}
                <span className="wa-num">{qualityLabel(quality)}</span><span className="wa-unit">p</span>
                <span className="wa-num">{total > 0 ? clock(total) : "--:--"}</span><span className="wa-unit">len</span>
                <span className={`wa-chan ${playing ? "is-lit" : ""}`}>stereo</span>
              </div>
            </div>
          </div>

          <div className="wa-under">
            {/* Ornament, not analysis: the audio is in a cross-origin iframe,
                so there is nothing here to measure. */}
            <div className={`wa-viz ${playing ? "is-on" : ""}`} aria-hidden="true">
              {Array.from({ length: 19 }, (_, i) => <i key={i} style={{ ["--b" as string]: String(i) }} />)}
            </div>
            {isSpeaker ? (
              <div className="wa-vol">
                <span className="wa-vol-l">VOL</span>
                <input
                  type="range" min={0} max={100} value={volume}
                  onChange={(e) => changeVolume(Number(e.target.value))}
                  className="wa-slider" aria-label="Volume"
                />
              </div>
            ) : (
              <span className="wa-muted">muted &mdash; sound is on the office speaker</span>
            )}
          </div>

          <div className="wa-seek" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <i style={{ width: `${pct}%` }} />
          </div>

          {/* ============ THE VIDEO. Nothing goes on top of this. ============ */}
          <div className="wa-screen">
            <div ref={mountRef} className="wa-embed" />
          </div>

          {isSpeaker ? (
            <div className="wa-ctl">
              <button type="button" className="wa-b" onClick={playPause} title={playing ? "Pause" : "Play"}>
                {playing ? "❚❚" : "▶"}
              </button>
              <button type="button" className="wa-b" onClick={() => { void advanceNow("skipped"); }} disabled={!now} title="Next">▶▶|</button>
              <span className="wa-ctl-sp" />
              <span className={`wa-lamp ${player.online ? "is-on" : ""}`} title="Speaker connected" />
            </div>
          ) : (
            <div className="wa-ctl wa-ctl-view">
              <span className="wa-viewnote">
                Watching along. {player.hostName ? `${player.hostName} is driving.` : "Nobody is driving right now."}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ============ equaliser ============
          Viewer-only, and PURELY DECORATIVE — stated here so nobody later
          wires a band to something and is surprised it does nothing. The audio
          is in a cross-origin iframe on another machine; there is no signal to
          analyse and no filter we could apply if there were. It exists because
          the viewer has no transport row, which left a hole where Winamp's
          most recognisable window used to sit, and because a room full of
          people watching a queue should have something to look at. The sliders
          drift while the track plays and settle when it stops. */}
      {!isSpeaker ? (
        <div className="wa-win wa-eqwin" aria-hidden="true">
          <div className="wa-tb">
            <i className="wa-grip" />
            <span className="wa-tb-name">EQUALIZER</span>
            <i className="wa-grip" />
            <span className="wa-tb-mode">AUTO</span>
          </div>
          <div className="wa-body">
            <div className={`wa-eq ${playing ? "is-on" : ""}`}>
              <div className="wa-eq-pre">
                <div className="wa-eq-slot"><i className="wa-eq-thumb" /></div>
                <span className="wa-eq-lab">PRE</span>
              </div>
              <div className="wa-eq-bands">
                {EQ_BANDS.map((b, i) => (
                  <div key={b} className="wa-eq-band" style={{ ["--b" as string]: String(i) }}>
                    <div className="wa-eq-slot"><i className="wa-eq-thumb" /></div>
                    <span className="wa-eq-lab">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={`wa-viz wa-viz-big ${playing ? "is-on" : ""}`}>
              {Array.from({ length: 40 }, (_, i) => <i key={i} style={{ ["--b" as string]: String(i) }} />)}
            </div>
          </div>
        </div>
      ) : null}

      {note ? <div className="wa-note">{note}</div> : null}

      {/* ============ playlist ============ */}
      <div className="wa-win">
        <div className="wa-tb">
          <i className="wa-grip" />
          <span className="wa-tb-name">PLAYLIST</span>
          <i className="wa-grip" />
          <span className="wa-tb-mode">{queue.length + (now ? 1 : 0)}</span>
        </div>
        <div className="wa-body">
          <div className="wa-pl">
            {now ? (
              <div className="wa-pl-row is-current">
                <span className="wa-pl-n">1.</span>
                <span className="wa-pl-t">{now.addedByName ? `${now.addedByName} — ` : ""}{now.title}</span>
                <span className="wa-pl-d">{clock(total)}</span>
              </div>
            ) : null}
            {queue.length === 0 && !now ? (
              <div className="wa-pl-empty">queue is empty</div>
            ) : (
              queue.slice(0, 14).map((t, i) => (
                <div key={t.id} className="wa-pl-row">
                  <span className="wa-pl-n">{i + (now ? 2 : 1)}.</span>
                  <span className="wa-pl-t">{t.addedByName ? `${t.addedByName} — ` : ""}{t.title}</span>
                  <span className="wa-pl-d">{clock(t.durationSeconds)}</span>
                </div>
              ))
            )}
          </div>
          <div className="wa-pl-foot">
            <span className="wa-pl-foot-t">{clock(elapsed)} / {clock(total)}</span>
            <span className="wa-pl-foot-n">{queue.length} queued</span>
          </div>
        </div>
      </div>
    </div>
  );
}

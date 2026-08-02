// apps/web/app/music/jukebox.tsx
//
// The queue, as everyone sees it.
//
// WHO CAN DO WHAT — this is the shape Amit asked for, and the split matters:
//
//   Everyone:            add a song, boost one, remove their own, skip their own
//   Admins and managers: pause, next, volume, and the speaker window
//
// The line is between PUTTING A SONG FORWARD and REACHING OVER TO THE STEREO
// while other people are listening to it. Boosting is the former — it's an
// opinion about what should come next. Skipping is the latter, because it
// changes what a whole room is hearing right now.
//
// The buttons below are hidden accordingly, but hiding a button is a courtesy,
// not a control: every one of these actions carries its own server-side check.
//
// EVERYONE GETS THE PLAYER PANEL, though — the green display, the marquee with
// whose song it is, the bars, and a live progress bar. Read-only for most
// people, but you can see exactly what the room is listening to and how far
// through it is. That was the point: less control, not less visibility.

"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addTrack, boostTrack, skipVote, removeTrack, searchTracks } from "./actions";
import { useToast } from "@/components/toaster";

interface Track {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  addedByName: string | null;
  boosts: number;
  boostedByMe: boolean;
  isMine: boolean;
}
interface MyTrack {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  timesAdded: number;
  active: boolean;
}
interface State {
  now: Track | null;
  queue: Track[];
  mine: MyTrack[];
  player: {
    online: boolean;
    isPaused: boolean;
    hostName: string | null;
    positionSeconds: number | null;
    durationSeconds: number | null;
    beatAgeSeconds: number | null;
  };
  myQueued: number;
  maxPerPerson: number;
  searchEnabled: boolean;
  canControl: boolean;
  /** True only when someone WITH control is deliberately looking without it. */
  previewing?: boolean;
}
interface Hit {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string;
}

const POLL_MS = 4000;
const TICK_MS = 500;

function fmt(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Whose song this is, as a thing you can see rather than a suffix.
 *
 * The first version buried the name at the end of "channel · 3:42 · Priya",
 * which reads as metadata. It isn't — knowing a colleague put this on is most
 * of what makes a shared queue feel like a room rather than a playlist.
 */
function Who({ name, isMine }: { name: string | null; isMine: boolean }) {
  if (!name) return null;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span className={`jb-by ${isMine ? "is-mine" : ""}`} title={isMine ? "You added this" : `${name} added this`}>
      <span className="jb-by-dot" aria-hidden="true">{initial}</span>
      {isMine ? "you" : name.split(/\s+/)[0]}
    </span>
  );
}

export function Jukebox({ initial }: { initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [url, setUrl] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, start] = useTransition();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // Interpolated playhead. Resynced on every poll, ticked locally between them
  // so the bar moves smoothly rather than jumping every four seconds.
  const [pos, setPos] = useState<number | null>(null);
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const applyState = useCallback((d: State) => {
    setState(d);
    setPending({});
    const p = d.player.positionSeconds;
    setPos(p === null ? null : p + (d.player.beatAgeSeconds ?? 0));
  }, []);

  const load = useCallback(async () => {
    try {
      // Carry the preview flag into the poll, or the controls reappear four
      // seconds after the admin opens it.
      const qs = initial.previewing ? "?as=member" : "";
      const r = await fetch(`/api/music/state${qs}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as State;
      applyState({ ...d, previewing: initial.previewing });
    } catch {
      // A dropped poll is a stale second, not an error worth showing.
    }
  }, [applyState, initial.previewing]);

  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // The local tick between beats.
  useEffect(() => {
    if (pos === null || state.player.isPaused || !state.now) return;
    const t = setInterval(() => setPos((p) => (p === null ? null : p + TICK_MS / 1000)), TICK_MS);
    return () => clearInterval(t);
  }, [pos === null, state.player.isPaused, state.now?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Open the speaker in a real detached window, not a tab.
   *
   * The bug this fixes: /music/player is its own route, so clicking back to
   * /music unmounted the player and the music stopped. The window NAME matters
   * as much as the size — calling open() again with the same name focuses the
   * window already there instead of starting a second speaker, which would
   * mean two songs at once.
   */
  function openSpeaker(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const w = window.open(
      "/music/player",
      "seekpeak-speaker",
      "width=560,height=760,menubar=no,toolbar=no,location=no,status=no",
    );
    if (!w) {
      toast("Your browser blocked the window — allow popups for seekpeak.in, or open the link in a new tab.", {
        tone: "error",
        duration: 9000,
      });
      return;
    }
    w.focus();
  }

  function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    start(async () => {
      const fd = new FormData();
      fd.set("url", value);
      const res = await addTrack(fd);
      if (res.ok) {
        setUrl("");
        setHits(null);
        toast("Added to the queue.");
        load();
      } else {
        toast(res.error, { tone: "error", duration: 8000 });
      }
      inputRef.current?.focus();
    });
  }

  function runSearch() {
    const q = url.trim();
    if (q.length < 2) return;
    setSearching(true);
    start(async () => {
      const results = await searchTracks(q);
      setSearching(false);
      if (results.length === 0) {
        toast("Nothing came back — try pasting the YouTube link instead.", { tone: "error" });
      }
      setHits(results);
    });
  }

  /**
   * One add path for every source — a pasted link, a search hit, or something
   * from your own history. addTrack takes a bare video id, so re-queueing gets
   * the duplicate check, the per-person cap and the length limit for free
   * rather than needing a second, subtly different code path.
   */
  function queueVideo(videoId: string, label: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("url", videoId);
      const res = await addTrack(fd);
      if (res.ok) {
        setUrl("");
        setHits(null);
        toast(`Queued "${label.slice(0, 40)}".`);
        load();
      } else {
        toast(res.error, { tone: "error", duration: 8000 });
      }
    });
  }

  function boost(t: Track) {
    const next = !(pending[t.id] ?? t.boostedByMe);
    setPending((p) => ({ ...p, [t.id]: next }));
    start(async () => {
      const fd = new FormData();
      fd.set("trackId", t.id);
      const res = await boostTrack(fd);
      if (!res.ok) {
        setPending((p) => {
          const rest = { ...p };
          delete rest[t.id];
          return rest;
        });
        toast(res.error, { tone: "error" });
      }
      load();
    });
  }

  function skip() {
    start(async () => {
      const res = await skipVote(new FormData());
      if (!res.ok) toast(res.error, { tone: "error", duration: 7000 });
      load();
    });
  }

  function remove(t: Track) {
    start(async () => {
      const fd = new FormData();
      fd.set("trackId", t.id);
      const res = await removeTrack(fd);
      if (!res.ok) toast(res.error, { tone: "error" });
      load();
    });
  }

  const { now, queue, player, canControl } = state;
  const atLimit = state.myQueued >= state.maxPerPerson;
  const live = Boolean(now) && player.online && !player.isPaused;
  const total = player.durationSeconds ?? now?.durationSeconds ?? null;
  const shownPos = pos === null ? null : total ? Math.min(pos, total) : pos;
  const pct = shownPos !== null && total ? Math.max(0, Math.min(100, (shownPos / total) * 100)) : 0;

  const marquee = now
    ? `${now.title}${now.channelTitle ? `  ·  ${now.channelTitle}` : ""}  ·  queued by ${now.addedByName ?? "someone"}`
    : "nothing playing  ·  add something below";

  return (
    <div className="jb">
      {state.previewing ? (
        <div className="jb-preview" role="status">
          <span className="jb-preview-eye" aria-hidden="true">👁</span>
          Viewing as a member — playback controls hidden. Everything else here is exactly what they see.
          <a href="/music" className="jb-preview-exit">Exit preview</a>
        </div>
      ) : null}

      {/* ---------------- now playing: the little Winamp ---------------- */}
      <section className={`jbw ${live ? "is-live" : ""}`}>
        {now?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={now.thumbnailUrl} alt="" className="jbw-art" />
        ) : (
          <div className="jbw-art jbw-art-blank" aria-hidden="true" />
        )}

        <div className="jbw-lcd">
          <div className="jbw-marquee">
            <span className={`jbw-marquee-in ${live ? "is-rolling" : ""}`}>
              {marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;{marquee}&nbsp;&nbsp;✦&nbsp;&nbsp;
            </span>
          </div>

          <div className="jbw-mid">
            <span className="jbw-time">{fmt(shownPos)}</span>
            {/* Ornament, not analysis. The audio lives in a cross-origin
                iframe on another machine entirely — there is nothing here to
                measure, and these bars are a mood rather than a reading. */}
            <div className={`jbw-viz ${live ? "is-on" : ""}`} aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ["--b" as string]: String(i) }} />)}
            </div>
            <span className="jbw-total">{fmt(total)}</span>
          </div>

          <div className="jbw-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="jbw-side">
          {now ? <Who name={now.addedByName} isMine={now.isMine} /> : null}
          {/* Everyone can withdraw their OWN song. Skipping someone else's is
              playback control and belongs to admins and managers. */}
          {now && (canControl || now.isMine) ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={skip} disabled={busy}>
              {now.isMine && !canControl ? "Skip mine" : "Skip"}
            </button>
          ) : null}
        </div>
      </section>

      {/* ---------------- speaker status ---------------- */}
      <div className="jb-status">
        <span className={`jb-dot ${player.online ? "is-on" : "is-off"}`} aria-hidden="true" />
        {player.online ? (
          <>
            {player.isPaused ? "Paused" : "Playing"}
            {player.hostName ? <> · {player.hostName}&rsquo;s machine</> : null}
          </>
        ) : (
          <>No speaker connected</>
        )}
        {canControl ? (
          <a
            href="/music/player"
            target="seekpeak-speaker"
            rel="noopener"
            className="jb-status-link"
            onClick={openSpeaker}
          >
            {player.online ? "Show the player →" : "Open the player →"}
          </a>
        ) : null}
        {canControl ? (
          <a href="/music?as=member" className="jb-status-link jb-status-alt">
            View as a member
          </a>
        ) : null}
      </div>

      {/* ---------------- add ---------------- */}
      <form className="jb-add" onSubmit={submitUrl}>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => { setUrl(e.target.value); setHits(null); }}
          placeholder={
            state.searchEnabled
              ? "Paste a YouTube link, or type to search…"
              : "Paste a YouTube or YouTube Music link…"
          }
          className="jb-input"
          aria-label="Add a song"
          disabled={atLimit}
        />
        {state.searchEnabled ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={runSearch} disabled={busy || atLimit}>
            {searching ? "Searching…" : "Search"}
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || atLimit || !url.trim()}>
          Add
        </button>
      </form>

      {atLimit ? (
        <p className="jb-limit">
          You&rsquo;ve got {state.myQueued} waiting, which is the limit — it stops one person owning the
          afternoon. Add another once one of yours has played.
        </p>
      ) : null}

      {/* YOUR SONGS. Placed under the add box on purpose: this is an input
          affordance, not an archive. The moment someone is thinking "what
          shall I put on", the answer is usually something they've played
          before, and the alternative is going back to YouTube to find the same
          link a fourth time. */}
      {state.mine.length > 0 ? (
        <div className="jb-mine">
          <div className="jb-mine-h">
            Your songs <span className="jb-mine-hint">tap to queue again</span>
          </div>
          <ul className="jb-mine-row">
            {state.mine.map((m) => (
              <li key={m.videoId}>
                <button
                  type="button"
                  className={`jb-mine-chip ${m.active ? "is-active" : ""}`}
                  onClick={() => queueVideo(m.videoId, m.title)}
                  disabled={busy || atLimit || m.active}
                  title={
                    m.active
                      ? "Already in the queue"
                      : atLimit
                        ? "You're at your limit for now"
                        : `Queue "${m.title}" again`
                  }
                >
                  {m.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.thumbnailUrl} alt="" className="jb-mine-art" />
                  ) : (
                    <span className="jb-mine-art jb-art-blank" />
                  )}
                  <span className="jb-mine-meta">
                    <span className="jb-mine-title">{m.title}</span>
                    <span className="jb-mine-sub">
                      {m.active ? "in the queue" : m.channelTitle}
                      {/* Only worth showing once it means something. */}
                      {!m.active && m.timesAdded > 1 ? ` · played ${m.timesAdded}×` : null}
                    </span>
                  </span>
                  <span className="jb-mine-plus" aria-hidden="true">{m.active ? "✓" : "+"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hits && hits.length > 0 ? (
        <ul className="jb-hits">
          {hits.map((h) => (
            <li key={h.videoId} className="jb-hit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={h.thumbnailUrl} alt="" className="jb-hit-art" />
              <div className="jb-hit-meta">
                <div className="jb-hit-title">{h.title}</div>
                <div className="jb-hit-sub">{h.channelTitle}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => queueVideo(h.videoId, h.title)}
                disabled={busy}
              >
                Queue
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* ---------------- the queue ---------------- */}
      <div className="jb-queue-head">
        <span>Up next</span>
        <span className="jb-queue-n">{queue.length === 0 ? "empty" : `${queue.length} waiting`}</span>
      </div>

      {queue.length === 0 ? (
        <p className="jb-empty">
          Nothing queued. Paste something in — whatever gets the most boosts plays first.
        </p>
      ) : (
        <ul className="jb-queue">
          {queue.map((t, i) => {
            const boosted = pending[t.id] ?? t.boostedByMe;
            const shown = t.boosts + (boosted === t.boostedByMe ? 0 : boosted ? 1 : -1);
            return (
              <li key={t.id} className="jb-row" style={{ ["--i" as string]: String(i) }}>
                <span className="jb-pos">{i + 1}</span>
                {t.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.thumbnailUrl} alt="" className="jb-row-art" />
                ) : (
                  <div className="jb-row-art jb-art-blank" />
                )}
                <div className="jb-row-meta">
                  <div className="jb-row-title">{t.title}</div>
                  <div className="jb-row-sub">
                    <Who name={t.addedByName} isMine={t.isMine} />
                    {t.channelTitle ? <span className="jb-row-chan">{t.channelTitle}</span> : null}
                    {t.durationSeconds ? <span className="jb-row-dur">{fmt(t.durationSeconds)}</span> : null}
                  </div>
                </div>
                {t.isMine || canControl ? (
                  <button
                    type="button"
                    className="jb-remove"
                    onClick={() => remove(t)}
                    disabled={busy}
                    aria-label="Remove from queue"
                    title={t.isMine ? "Remove yours" : "Remove"}
                  >
                    ×
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`jb-boost ${boosted ? "is-on" : ""}`}
                  onClick={() => boost(t)}
                  disabled={busy}
                  aria-pressed={boosted}
                  aria-label={boosted ? "Remove your boost" : "Boost this song"}
                >
                  <span className="jb-boost-caret" aria-hidden="true">▲</span>
                  <span className="jb-boost-n">{shown}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

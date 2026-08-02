// apps/web/app/music/jukebox.tsx
//
// The queue, as everyone else sees it. Add something, boost what you want
// next, vote to move on from what's playing.
//
// This is a live surface, so it polls — see the API route for why not sockets.
// Two details that make it feel alive rather than merely correct:
//
//   • OPTIMISTIC BOOSTS. The count moves the instant you click, then the poll
//     confirms it. A vote button that waits a round-trip before responding
//     feels broken even when it isn't, and this is a toy — it has to feel good
//     or people stop using it.
//
//   • THE QUEUE ANIMATES INTO ITS NEW ORDER. When a boost moves a song up,
//     seeing it move is the entire feedback. Rows are keyed by track id so
//     React reuses the DOM node and the CSS transition has something to
//     animate; keying by index would make them teleport.

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
interface Now extends Track {
  skips: number;
  skippedByMe: boolean;
  skipThreshold: number;
}
interface State {
  now: Now | null;
  queue: Track[];
  player: { online: boolean; isPaused: boolean; hostName: string | null };
  myQueued: number;
  maxPerPerson: number;
  searchEnabled: boolean;
}
interface Hit {
  videoId: string;
  title: string;
  channelTitle: string | null;
  thumbnailUrl: string;
}

const POLL_MS = 4000;

function fmt(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function Jukebox({ initial }: { initial: State }) {
  const [state, setState] = useState<State>(initial);
  const [url, setUrl] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, start] = useTransition();
  // Boosts applied locally but not yet confirmed by a poll. Keyed by track id
  // so a poll landing mid-click can't clobber the optimistic value.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/music/state", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as State;
      setState(d);
      setPending({}); // The server has spoken; drop the optimistic layer.
    } catch {
      // A dropped poll is a stale second, not an error worth showing.
    }
  }, []);

  useEffect(() => {
    const t = setInterval(load, POLL_MS);
    // Poll harder right after the tab regains focus — you've probably been
    // away and the queue has moved on without you.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

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

  function addFromHit(h: Hit) {
    start(async () => {
      const fd = new FormData();
      fd.set("url", h.videoId);
      const res = await addTrack(fd);
      if (res.ok) {
        setUrl("");
        setHits(null);
        toast(`Queued "${h.title.slice(0, 40)}".`);
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
          const { [t.id]: _drop, ...rest } = p;
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
      if (!res.ok) toast(res.error, { tone: "error" });
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

  const { now, queue, player } = state;
  const atLimit = state.myQueued >= state.maxPerPerson;

  return (
    <div className="jb">
      {/* ---------------- now playing ---------------- */}
      <section className={`jb-now ${now ? "is-live" : "is-quiet"}`}>
        {now ? (
          <>
            {now.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={now.thumbnailUrl} alt="" className="jb-now-art" />
            ) : (
              <div className="jb-now-art jb-art-blank" />
            )}
            <div className="jb-now-meta">
              <div className="jb-now-label">
                <span className="jb-eq" aria-hidden="true"><i /><i /><i /></span>
                Now playing
              </div>
              <div className="jb-now-title">{now.title}</div>
              <div className="jb-now-sub">
                {now.channelTitle}
                {now.addedByName ? <> · added by {now.isMine ? "you" : now.addedByName}</> : null}
              </div>
            </div>
            <div className="jb-now-actions">
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${now.skippedByMe ? "is-active" : ""}`}
                onClick={skip}
                disabled={busy || now.skippedByMe}
                title={now.isMine ? "It's yours — this skips it straight away" : "Vote to move on"}
              >
                {now.isMine
                  ? "Skip mine"
                  : now.skippedByMe
                    ? `Skip voted (${now.skips}/${now.skipThreshold})`
                    : `Skip (${now.skips}/${now.skipThreshold})`}
              </button>
            </div>
          </>
        ) : (
          <div className="jb-now-meta">
            <div className="jb-now-title jb-quiet-title">
              {player.online ? "Nothing playing — queue something." : "The speaker isn't running."}
            </div>
            <div className="jb-now-sub">
              {player.online
                ? "The player is connected and waiting for the queue."
                : "Someone needs to open the player page on the machine that's plugged into the speaker."}
            </div>
          </div>
        )}
      </section>

      {/* ---------------- speaker status ---------------- */}
      <div className="jb-status">
        <span className={`jb-dot ${player.online ? "is-on" : "is-off"}`} aria-hidden="true" />
        {player.online ? (
          <>Speaker connected{player.hostName ? <> · {player.hostName}&rsquo;s machine</> : null}</>
        ) : (
          <>No speaker connected</>
        )}
        <a href="/music/player" target="_blank" rel="noopener noreferrer" className="jb-status-link">
          Open the player →
        </a>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => addFromHit(h)} disabled={busy}>
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
            // Show the optimistic delta so the number moves with the button.
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
                    {t.channelTitle}
                    {t.durationSeconds ? <> · {fmt(t.durationSeconds)}</> : null}
                    {t.addedByName ? <> · {t.isMine ? "you" : t.addedByName}</> : null}
                  </div>
                </div>
                {t.isMine ? (
                  <button
                    type="button"
                    className="jb-remove"
                    onClick={() => remove(t)}
                    disabled={busy}
                    aria-label="Remove from queue"
                    title="Remove"
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

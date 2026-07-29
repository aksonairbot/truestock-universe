// apps/web/app/content/content-board.tsx
//
// The production pipeline as a board: idea → script → design → review →
// scheduled → published. Drag a card across and the stage persists.
//
// WHY THIS EXISTS ALONGSIDE THE CALENDAR
// The calendar answers "what goes out on the 14th?". The board answers "what
// is stuck in design?" — the question a marketing lead actually asks in a
// standup. Same items, two views; neither replaces the other.
//
// TOUCH + KEYBOARD: HTML5 drag-and-drop does not exist on touch devices and
// is invisible to keyboard users, so every card also carries a stage <select>.
// It is not a fallback bolted on — it is the primary control on a phone, and
// it routes through exactly the same moveTo() as a drop, so the two paths can
// never disagree.
//
// THE INTERESTING DECISION: the illegal moves are refused HERE, on the
// client, before the round trip. Next.js redacts server-action error messages
// in production, so a server rejection would surface as "something went
// wrong" — useless. The board already knows whether an item has a slot and a
// sign-off, so it can say exactly what is missing, instantly. The server
// still enforces the same rules (content-actions.ts); this is the explanation
// layer, not the security layer.

"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { setContentStage } from "../tasks/content-actions";
import { useToast } from "@/components/toaster";
import { CONTENT_STAGES, CHANNEL_COLOR, CHANNEL_LABEL, STAGE_LABEL } from "@/lib/content";

export interface BoardItem {
  id: string;
  title: string;
  channel: string | null;
  stage: string | null;
  publishAt: string | Date | null;
  approvedAt: string | Date | null;
  publishState: string;
  assignee: string | null;
}

function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitial(name?: string | null): string {
  if (!name) return "?";
  return name.trim()[0]?.toUpperCase() ?? "?";
}
function fmtSlot(d: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

const GATED = new Set(["scheduled", "published"]);

export function ContentBoard({ items }: { items: BoardItem[] }) {
  const toast = useToast();
  const [, start] = useTransition();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overCol, setOverCol] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const stageOf = (t: BoardItem) => overrides[t.id] ?? t.stage ?? "idea";

  const grouped = useMemo(() => {
    const g: Record<string, BoardItem[]> = {};
    for (const s of CONTENT_STAGES) g[s.value] = [];
    for (const t of items) (g[stageOf(t)] ?? g.idea!).push(t);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, overrides]);

  function persist(id: string, stage: string, onFail: () => void) {
    const fd = new FormData();
    fd.set("taskId", id);
    fd.set("stage", stage);
    start(async () => {
      try {
        await setContentStage(fd);
      } catch {
        onFail();
        toast("Couldn't move that — change reverted.", { tone: "error" });
      }
    });
  }

  /**
   * Returns the reason a move is not allowed, or null when it is. Mirrors the
   * server's rules so the person hears WHY without waiting for a round trip.
   */
  function blockedReason(t: BoardItem, next: string): string | null {
    if (!GATED.has(next)) return null;
    if (!t.publishAt) return "Pick a publish date first — open the item and set a slot.";
    if (!t.approvedAt) return "This needs an admin or manager to approve it first.";
    return null;
  }

  function moveTo(t: BoardItem, next: string) {
    const prev = stageOf(t);
    if (prev === next) return;

    const blocked = blockedReason(t, next);
    if (blocked) {
      toast(blocked, { tone: "error" });
      return;
    }

    setOverrides((o) => ({ ...o, [t.id]: next }));
    persist(t.id, next, () => setOverrides((o) => ({ ...o, [t.id]: prev })));

    const short = t.title.length > 40 ? `${t.title.slice(0, 40)}…` : t.title;
    toast(`Moved "${short}" to ${STAGE_LABEL[next]}`, {
      undo: () => {
        setOverrides((o) => ({ ...o, [t.id]: prev }));
        persist(t.id, prev, () => setOverrides((o) => ({ ...o, [t.id]: next })));
      },
    });
  }

  return (
    <div className="kanban cboard">
      {CONTENT_STAGES.map((s) => {
        const col = grouped[s.value] ?? [];
        return (
          <div
            key={s.value}
            className={`kcol ${overCol === s.value ? "kcol-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverCol(s.value);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverCol(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              const id = dragId.current ?? e.dataTransfer.getData("text/plain");
              dragId.current = null;
              const item = items.find((r) => r.id === id);
              if (item) moveTo(item, s.value);
            }}
          >
            <div className="kcol-head">
              <div className="kcol-title flex items-center gap-2">
                <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: s.color }} />
                {s.label}
              </div>
              <div className="kcol-count">{col.length}</div>
            </div>

            {col.length === 0 ? (
              <div className="text-text-3 italic text-xs px-2 py-3 text-center">
                {overCol === s.value ? "Drop here" : "empty"}
              </div>
            ) : (
              col.map((t) => {
                const needsApproval = !t.approvedAt;
                const live = t.publishState === "published";
                const failed = t.publishState === "failed";
                return (
                  <div
                    key={t.id}
                    className={`tcard ccard ${live ? "is-live" : ""} ${failed ? "is-failed" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      dragId.current = t.id;
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                      (e.currentTarget as HTMLElement).classList.add("tcard-dragging");
                    }}
                    onDragEnd={(e) => {
                      (e.currentTarget as HTMLElement).classList.remove("tcard-dragging");
                      setOverCol(null);
                    }}
                  >
                    <Link href={`/tasks/${t.id}`} className="ccard-open no-underline">
                    <div className="flex gap-1 flex-wrap items-center">
                      <span
                        className="content-chip"
                        style={{
                          color: CHANNEL_COLOR[t.channel ?? ""] ?? "var(--text-3)",
                          borderColor: CHANNEL_COLOR[t.channel ?? ""] ?? "var(--border)",
                        }}
                      >
                        {CHANNEL_LABEL[t.channel ?? ""] ?? "Content"}
                      </span>
                      {failed ? <span className="ccard-flag is-err">failed</span> : null}
                      {live ? <span className="ccard-flag is-ok">live</span> : null}
                      {!live && !failed && needsApproval ? (
                        <span className="ccard-flag is-warn" title="Not approved">unapproved</span>
                      ) : null}
                    </div>

                    <div className="ttitle">{t.title}</div>

                    <div className="tmeta">
                      {t.assignee ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`tava ${avaClass(t.assignee)}`}>{avaInitial(t.assignee)}</span>
                          {t.assignee}
                        </span>
                      ) : (
                        <span className="text-text-3 italic">unassigned</span>
                      )}
                      <span className="ccard-slot">
                        {t.publishAt ? fmtSlot(t.publishAt) : <span className="text-text-3 italic">no slot</span>}
                      </span>
                    </div>
                    </Link>

                    {/* Works on touch, works with a keyboard, works when a
                        drag is fiddly on a trackpad. Same code path as a drop. */}
                    <select
                      className="ccard-move"
                      value={stageOf(t)}
                      aria-label={`Move "${t.title}" to another stage`}
                      onChange={(e) => moveTo(t, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {CONTENT_STAGES.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

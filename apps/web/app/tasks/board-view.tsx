// apps/web/app/tasks/board-view.tsx
//
// Kanban board with DRAG-AND-DROP between columns (the biggest remaining
// interaction gap vs Asana/monday). Zero dependencies — native HTML5 DnD.
//
// Every card ALSO carries a status <select>. HTML5 drag-and-drop does not
// exist on touch devices and is invisible to keyboard users, so on a phone
// that select is the primary control, not a fallback. Both paths call the
// same moveTo(), so they can never disagree.
// Dropping a card moves it optimistically, persists via updateTaskStatus,
// shows a toast with Undo, and reverts (with an error toast) if the server
// rejects the change.

"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { updateTaskStatus } from "./actions";
import { fmtDueCountdown } from "@/lib/worktime";
import { useToast } from "@/components/toaster";

const BOARD_COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;
type ColStatus = (typeof BOARD_COLUMNS)[number];

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_DOT: Record<string, string> = {
  backlog: "var(--text-3)",
  todo: "#60A5FA",
  in_progress: "var(--accent)",
  review: "var(--warning)",
  done: "var(--success)",
  cancelled: "var(--text-4)",
};

// Shapes match the drizzle select in page.tsx. Left-joined assignee comes
// back as { id: null, name: null } (not null) when unassigned, so the inner
// fields must be nullable or the server build fails on assignment.
export interface BoardRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  project: { slug: string; name: string };
  assignee: { id: string | null; name: string | null } | null;
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
function fmtDate(d: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}
function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function isOverdue(t: { dueDate: string | Date | null; status: string }): boolean {
  if (!t.dueDate || t.status === "done" || t.status === "cancelled") return false;
  const s = typeof t.dueDate === "string" ? t.dueDate.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(t.dueDate);
  return s < todayIST();
}

export function BoardView({ rows, hrefParams }: { rows: BoardRow[]; hrefParams: string }) {
  const toast = useToast();
  const [, start] = useTransition();
  // Optimistic status overrides — applied on top of the server-rendered rows.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [overCol, setOverCol] = useState<ColStatus | null>(null);
  const dragId = useRef<string | null>(null);

  const effectiveStatus = (t: BoardRow) => overrides[t.id] ?? t.status;

  const grouped = useMemo(() => {
    const g: Record<string, BoardRow[]> = { backlog: [], todo: [], in_progress: [], review: [], done: [], cancelled: [] };
    for (const t of rows) (g[effectiveStatus(t)] ?? g.todo!).push(t);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, overrides]);

  function persist(taskId: string, status: string, onFail: () => void) {
    const fd = new FormData();
    fd.set("taskId", taskId);
    fd.set("status", status);
    start(async () => {
      try {
        await updateTaskStatus(fd);
      } catch {
        onFail();
        toast("Couldn't move the task — change reverted.", { tone: "error" });
      }
    });
  }

  function moveTo(task: BoardRow, next: ColStatus) {
    const prev = effectiveStatus(task);
    if (prev === next) return;
    setOverrides((o) => ({ ...o, [task.id]: next }));
    persist(task.id, next, () => setOverrides((o) => ({ ...o, [task.id]: prev })));
    toast(`Moved "${task.title.slice(0, 40)}${task.title.length > 40 ? "…" : ""}" to ${STATUS_LABEL[next]}`, {
      undo: () => {
        setOverrides((o) => ({ ...o, [task.id]: prev }));
        persist(task.id, prev, () => setOverrides((o) => ({ ...o, [task.id]: next })));
      },
    });
  }

  const rowHref = (id: string) => `/tasks?${hrefParams ? `${hrefParams}&` : ""}task=${id}`;

  return (
    <div className="kanban motion-stagger">
      {BOARD_COLUMNS.map((s) => {
        const items = grouped[s] ?? [];
        return (
          <div
            key={s}
            className={`kcol ${overCol === s ? "kcol-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverCol(s);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverCol(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOverCol(null);
              const id = dragId.current ?? e.dataTransfer.getData("text/plain");
              dragId.current = null;
              const task = rows.find((r) => r.id === id);
              if (task) moveTo(task, s);
            }}
          >
            <div className="kcol-head">
              <div className="kcol-title flex items-center gap-2">
                <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: STATUS_DOT[s] }} />
                {STATUS_LABEL[s]}
              </div>
              <div className="kcol-count">{items.length}</div>
            </div>

            {items.length === 0 ? (
              <div className="text-text-3 italic text-xs px-2 py-3 text-center">
                {overCol === s ? "Drop here" : "empty"}
              </div>
            ) : (
              items.map((t) => (
                <div
                  key={t.id}
                  className="tcard"
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
                  <Link href={rowHref(t.id)} className="ccard-open no-underline" scroll={false}>
                  <div className="flex gap-1 flex-wrap">
                    <span className={`pchip ${t.project.slug}`}>{t.project.name}</span>
                    {t.priority === "urgent" || t.priority === "high" ? (
                      <span className={`prio ${t.priority}`}>{t.priority}</span>
                    ) : null}
                  </div>
                  <div className="ttitle">{t.title}</div>
                  <div className="tmeta">
                    {t.assignee?.name ? (
                      <span className="flex items-center gap-1.5">
                        <span className={`tava ${avaClass(t.assignee.name)}`}>{avaInitial(t.assignee.name)}</span>
                        {t.assignee.name}
                      </span>
                    ) : (
                      <span className="text-text-3 italic">unassigned</span>
                    )}
                    <span className={`tdue ${isOverdue({ ...t, status: effectiveStatus(t) }) ? "red" : ""}`} title={fmtDate(t.dueDate)}>
                      {t.dueDate
                        ? effectiveStatus(t) === "done" || effectiveStatus(t) === "cancelled"
                          ? fmtDate(t.dueDate)
                          : fmtDueCountdown(t.dueDate)
                        : ""}
                    </span>
                  </div>
                  </Link>

                  {/* Touch + keyboard path. Same moveTo() as a drop. */}
                  <select
                    className="ccard-move"
                    value={effectiveStatus(t)}
                    aria-label={`Move "${t.title}" to another column`}
                    onChange={(e) => moveTo(t, e.target.value as ColStatus)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {BOARD_COLUMNS.map((opt) => (
                      <option key={opt} value={opt}>{STATUS_LABEL[opt]}</option>
                    ))}
                  </select>
                </div>
              ))
            )}

            <Link href="/tasks/new" className="kcol-add">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add task
            </Link>
          </div>
        );
      })}
    </div>
  );
}

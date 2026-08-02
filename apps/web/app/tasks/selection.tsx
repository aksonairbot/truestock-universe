// apps/web/app/tasks/selection.tsx
//
// Multi-select on the task list, plus the action bar that appears once
// something is selected. Asana/monday's core throughput feature and the last
// obvious gap here — clearing a backlog was forty individual clicks.
//
// HOW IT'S WIRED
// The provider is a client component wrapping SERVER-rendered rows, which is
// what lets a checkbox inside a server component share state with the bar.
// The rows stay server components; only the checkbox and the bar are client.
//
// Shift-click extends a range, because selecting eleven consecutive rows one
// by one is exactly the tedium this feature exists to remove. That needs the
// row ORDER, so the provider is given the visible ids in display order.
//
// KEYBOARD (j/k/x/enter, Gmail- and Linear-style) lives here too, for the same
// reason: the provider is the only thing that knows the row order. Selecting
// with the mouse is fine for four rows; for forty you want to hold j.
//
// The focus RING is applied by toggling a class on the row element found via
// its data-task-id attribute. Direct DOM, deliberately: the alternative is
// making every row a client component, which would ship the whole list to the
// browser and lose the streaming. A one-line querySelector is the cheaper
// trade, and it is confined to this file.

"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bulkUpdateTasks, bulkRestoreTasks, type TaskSnapshot } from "./bulk-actions";
import { useToast } from "@/components/toaster";

type Ctx = {
  selected: Set<string>;
  toggle: (id: string, shiftKey: boolean) => void;
  clear: () => void;
  selectAll: () => void;
  allIds: string[];
};

const ROW_FOCUS_CLASS = "is-kbfocus";

const SelectionCtx = createContext<Ctx | null>(null);

export function SelectionProvider({
  allIds,
  openPrefix,
  children,
}: {
  /** Visible task ids in display order — shift-click and j/k need the order. */
  allIds: string[];
  /** Row href prefix, e.g. "/tasks?group=status&" — a function can't cross the
   *  server/client boundary, so the prefix comes over as a string. */
  openPrefix?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const toggle = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shiftKey && lastClicked.current && lastClicked.current !== id) {
          const a = allIds.indexOf(lastClicked.current);
          const b = allIds.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [from, to] = a < b ? [a, b] : [b, a];
            // A range always SELECTS — extending a selection shouldn't
            // deselect rows you already had.
            for (let i = from; i <= to; i++) next.add(allIds[i]!);
            lastClicked.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastClicked.current = id;
        return next;
      });
    },
    [allIds],
  );

  const clear = useCallback(() => {
    setSelected(new Set());
    lastClicked.current = null;
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(allIds)), [allIds]);

  // Move the ring, and keep the focused row on screen.
  useEffect(() => {
    for (const el of Array.from(document.querySelectorAll(`.${ROW_FOCUS_CLASS}`))) {
      el.classList.remove(ROW_FOCUS_CLASS);
    }
    if (!focused) return;
    const el = document.querySelector(`[data-task-id="${focused}"]`);
    if (!el) return;
    el.classList.add(ROW_FOCUS_CLASS);
    el.scrollIntoView({ block: "nearest" });
  }, [focused]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      // Never steal keys from a field, and never fight a real shortcut.
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        Boolean(t?.isContentEditable);
      // Enter on a focused button or link belongs to that control. Without
      // this, pressing Enter on "Show closed" would activate the button AND
      // navigate to the focused row.
      const onControl =
        t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || t?.tagName === "SUMMARY";
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (onControl && (e.key === "Enter" || e.key === " ")) return;
      if (allIds.length === 0) return;

      const key = e.key;
      const lower = key.toLowerCase();
      const idx = focused ? allIds.indexOf(focused) : -1;

      const move = (delta: number) => {
        e.preventDefault();
        const next = idx === -1 ? (delta > 0 ? 0 : allIds.length - 1) : Math.min(Math.max(idx + delta, 0), allIds.length - 1);
        const id = allIds[next]!;
        // Shift+j/k extends the selection as it moves, like Gmail.
        if (e.shiftKey) {
          setSelected((prev) => {
            const s2 = new Set(prev);
            if (focused) s2.add(focused);
            s2.add(id);
            return s2;
          });
          lastClicked.current = id;
        }
        setFocused(id);
      };

      if (lower === "j" || key === "ArrowDown") return move(1);
      if (lower === "k" || key === "ArrowUp") return move(-1);

      if (lower === "x" && focused) {
        e.preventDefault();
        toggle(focused, false);
        return;
      }
      if ((key === "Enter" || lower === "o") && focused) {
        e.preventDefault();
        router.push(`${openPrefix ?? "/tasks?"}task=${focused}`);
        return;
      }
      if (key === "Escape") {
        // Escape peels one layer at a time: selection first, then the ring.
        if (selected.size > 0) {
          e.preventDefault();
          clear();
        } else if (focused) {
          e.preventDefault();
          setFocused(null);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allIds, focused, selected, toggle, clear, router, openPrefix]);

  const value = useMemo<Ctx>(() => ({ selected, toggle, clear, selectAll, allIds }), [selected, toggle, clear, selectAll, allIds]);

  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

function useSelection(): Ctx | null {
  return useContext(SelectionCtx);
}

/** The per-row checkbox. Renders nothing outside a provider, so TaskRow is
 *  safe to reuse on pages that don't opt into selection. */
export function SelectCheck({ taskId }: { taskId: string }) {
  const ctx = useSelection();
  if (!ctx) return null;
  const on = ctx.selected.has(taskId);
  return (
    <label className={`selchk ${on ? "is-on" : ""}`} onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={on}
        aria-label={on ? "Deselect task" : "Select task"}
        onChange={() => {}}
        onClick={(e) => {
          e.stopPropagation();
          ctx.toggle(taskId, (e as unknown as MouseEvent).shiftKey);
        }}
      />
      <span className="selchk-box" aria-hidden="true" />
    </label>
  );
}

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
  { value: "backlog", label: "Backlog" },
];
const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "med", label: "Medium" },
  { value: "low", label: "Low" },
];

/** Today (+n days) as YYYY-MM-DD — the team is IST, local clock is fine. */
function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BulkBar({
  users,
  canAssignOthers,
}: {
  users: Array<{ id: string; name: string }>;
  canAssignOthers: boolean;
}) {
  const ctx = useSelection();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!ctx || ctx.selected.size === 0) return null;
  const ids = Array.from(ctx.selected);
  const n = ids.length;

  function run(op: string, value: string, label: string) {
    const fd = new FormData();
    fd.set("taskIds", ids.join(","));
    fd.set("op", op);
    fd.set("value", value);
    start(async () => {
      try {
        const res = await bulkUpdateTasks(fd);
        // The refusal comes back as a VALUE — Next redacts thrown messages in
        // production, which is how "Some of those tasks aren't yours to
        // change" used to arrive as a shrug.
        if (!res.ok) {
          toast(res.error, { tone: "error" });
          return;
        }
        const { updated, prev } = res;
        ctx!.clear();
        setConfirmCancel(false);
        // Real undo, from the snapshots the action returned. A bulk edit you
        // can't reverse is a bulk mistake waiting to happen.
        toast(`${updated} task${updated === 1 ? "" : "s"} → ${label}`, {
          undo: () => {
            start(async () => {
              try {
                const back = await bulkRestoreTasks(prev as TaskSnapshot[]);
                toast(back.ok ? "Reverted." : back.error, back.ok ? undefined : { tone: "error" });
              } catch {
                toast("Couldn't revert — reload and check.", { tone: "error" });
              }
            });
          },
        });
      } catch {
        // Only a genuine fault reaches here now, and its message is redacted
        // anyway — so say something true rather than something specific.
        toast("Couldn't apply that to the selection.", { tone: "error" });
      }
    });
  }

  return (
    <div className={`bulkbar ${pending ? "is-busy" : ""}`} role="region" aria-label="Bulk actions">
      <span className="bulkbar-n">{n} selected</span>

      {n < ctx.allIds.length ? (
        <button type="button" className="bulkbar-link" onClick={ctx.selectAll}>
          Select all {ctx.allIds.length}
        </button>
      ) : null}

      <select
        aria-label="Set status"
        className="bulkbar-sel"
        value=""
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v) run("status", v, STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v);
        }}
      >
        <option value="">Status…</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        aria-label="Set priority"
        className="bulkbar-sel"
        value=""
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v) run("priority", v, PRIORITY_OPTIONS.find((p) => p.value === v)?.label ?? v);
        }}
      >
        <option value="">Priority…</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      <select
        aria-label="Set due date"
        className="bulkbar-sel"
        value=""
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v) run("dueDate", v, v === isoPlus(0) ? "due today" : `due ${v}`);
        }}
      >
        <option value="">Due…</option>
        <option value={isoPlus(0)}>Today</option>
        <option value={isoPlus(1)}>Tomorrow</option>
        <option value={isoPlus(3)}>In 3 days</option>
        <option value={isoPlus(7)}>In a week</option>
      </select>

      {canAssignOthers ? (
        <select
          aria-label="Assign to"
          className="bulkbar-sel"
          value=""
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            if (v) run("assignee", v, users.find((u) => u.id === v)?.name ?? "assignee");
          }}
        >
          <option value="">Assign…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      ) : null}

      {/* Cancelling is the closest thing to a delete in this app (tasks with an
          assignee are never hard-deleted), so it asks first. */}
      {confirmCancel ? (
        <span className="bulkbar-confirm">
          Cancel {n} task{n === 1 ? "" : "s"}?
          <button type="button" className="bulkbar-danger" disabled={pending} onClick={() => run("status", "cancelled", "Cancelled")}>
            Yes, cancel
          </button>
          <button type="button" className="bulkbar-link" onClick={() => setConfirmCancel(false)}>
            No
          </button>
        </span>
      ) : (
        <button type="button" className="bulkbar-link is-danger" disabled={pending} onClick={() => setConfirmCancel(true)}>
          Cancel tasks
        </button>
      )}

      <span className="bulkbar-keys" aria-hidden="true">j k move · x select · ↵ open</span>

      <button type="button" className="bulkbar-link bulkbar-clear" onClick={ctx.clear}>
        Clear
      </button>
    </div>
  );
}

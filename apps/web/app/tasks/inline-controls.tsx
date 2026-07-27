"use client";

import { useEffect, useState, useTransition } from "react";
import { updateTaskStatus, assignTask, updateTaskPriority, updateTaskRecurrence } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;

export function StatusSelect({ taskId, status }: { taskId: string; status: string }) {
  // Optimistic: show the new value the instant it's picked; revert if the
  // server action fails. Previously the select sat disabled+greyed until the
  // full server round-trip (and revalidation) finished.
  const [value, setValue] = useState(status);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();

  // Stay in sync when the server re-renders with a new status (e.g. someone
  // else changed it, or the done-checkbox was used).
  useEffect(() => { setValue(status); }, [status]);

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        const prev = value;
        setValue(next);
        setFailed(false);
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("status", next);
        start(async () => {
          try {
            await updateTaskStatus(fd);
          } catch {
            setValue(prev); // revert — server rejected the change
            setFailed(true);
          }
        });
      }}
      className={`status-select st-${value} border rounded-md px-2 py-1 text-xs cursor-pointer`}
      style={failed ? { borderColor: "var(--danger)" } : undefined}
      title={failed ? "Change was rejected — reverted" : undefined}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * Round completion check with instant, satisfying feedback (Things-style):
 * checks the moment you tap it, plays a soft ring-burst + checkmark draw,
 * and reverts quietly if the server rejects the change. Replaces the no-JS
 * form post that made ticking a task feel like a page load.
 */
export function DoneCheck({ taskId, done, cancelled }: { taskId: string; done: boolean; cancelled?: boolean }) {
  const [checked, setChecked] = useState(done);
  const [burst, setBurst] = useState(false);
  const [, start] = useTransition();

  useEffect(() => { setChecked(done); }, [done]);

  if (cancelled) {
    return (
      <span
        className="acheck"
        style={{ opacity: 0.35, cursor: "not-allowed" }}
        title="Cancelled — reopen it from the task page first"
        aria-label="Cancelled task"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={checked ? "Mark as to do" : "Mark as done"}
      title={checked ? "Mark as to do" : "Mark as done"}
      className={`acheck ${checked ? "is-done" : ""} ${burst ? "acheck-pop" : ""}`}
      onClick={() => {
        const next = !checked;
        setChecked(next);
        if (next) {
          setBurst(true);
          setTimeout(() => setBurst(false), 650);
        }
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("status", next ? "done" : "todo");
        start(async () => {
          try {
            await updateTaskStatus(fd);
          } catch {
            setChecked(!next); // server said no — quietly revert
          }
        });
      }}
    >
      {checked ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
          <path className="acheck-tick" d="m5 12 5 5L20 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function AssigneeSelect({
  taskId,
  assigneeId,
  users,
  canAssignOthers = false,
}: {
  taskId: string;
  assigneeId: string | null;
  users: Array<{ id: string; name: string }>;
  /** Only admins/managers can pick someone else. Defaults to false so
   *  call-sites that forget to pass it stay locked. Server enforces the
   *  same rule — this is just the UX so users don't see a dropdown they
   *  can't use. */
  canAssignOthers?: boolean;
}) {
  const [pending, start] = useTransition();

  // Non-privileged users see a read-only label — no inline reassignment.
  if (!canAssignOthers) {
    const current = users.find((u) => u.id === assigneeId);
    return (
      <span className="text-xs text-text-2">
        {current?.name ?? "— unassigned"}
      </span>
    );
  }

  return (
    <select
      defaultValue={assigneeId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("assigneeId", e.target.value);
        start(() => {
          assignTask(fd);
        });
      }}
      className="bg-transparent border-0 text-xs text-text-2 hover:text-text cursor-pointer disabled:opacity-50"
    >
      <option value="">— unassigned</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}

const PRIORITIES = ["low", "med", "high", "urgent"] as const;
const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
  urgent: "Urgent",
};

const RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
const RECURRENCE_LABELS: Record<string, string> = {
  none: "Doesn't repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export function RecurrenceSelect({ taskId, recurrence }: { taskId: string; recurrence: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={recurrence}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("recurrence", e.target.value);
        start(() => {
          updateTaskRecurrence(fd);
        });
      }}
      className="bg-panel-2 border border-border-2 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50"
    >
      {RECURRENCES.map((r) => (
        <option key={r} value={r}>
          {RECURRENCE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}


// title/description/dueDate were once props here because the sidebar select
// went through the catch-all updateTaskMeta action — that meant a priority
// change shipped a stale snapshot of the description with it and could
// silently overwrite someone's in-flight edit. Priority now has its own
// dedicated action; the other props are no longer needed.
export function PrioritySelect({
  taskId,
  priority,
  // Legacy props kept optional so existing call sites keep compiling until
  // they're cleaned up — they are intentionally unused.
  title: _title,
  description: _description,
  dueDate: _dueDate,
}: {
  taskId: string;
  priority: string;
  title?: string;
  description?: string | null;
  dueDate?: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={priority}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("priority", e.target.value);
        start(() => {
          updateTaskPriority(fd);
        });
      }}
      className="bg-panel-2 border border-border-2 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50"
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABELS[p]}
        </option>
      ))}
    </select>
  );
}

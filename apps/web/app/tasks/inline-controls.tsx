"use client";

import { useTransition } from "react";
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
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("status", e.target.value);
        start(() => {
          updateTaskStatus(fd);
        });
      }}
      className="bg-panel-2 border border-border-2 rounded-md px-2 py-1 text-xs cursor-pointer disabled:opacity-50"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
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

"use client";

import { useTransition } from "react";
import { updateTaskStatus, assignTask } from "./actions";

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
}: {
  taskId: string;
  assigneeId: string | null;
  users: Array<{ id: string; name: string }>;
}) {
  const [pending, start] = useTransition();
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

"use client";

import { useRouter } from "next/navigation";

const GROUP_OPTIONS = [
  { value: "due", label: "Due date" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "project", label: "Project" },
] as const;

export function GroupForm({ view, group, q, extra = {} }: { view?: string; group: string; q: string; extra?: Record<string, string> }) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    const val = e.target.value;
    if (val !== "due") params.set("group", val);
    if (q) params.set("q", q);
    // Preserve active filters (assignee/priority/project) across regrouping
    for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
    const qs = params.toString();
    router.push(qs ? `/tasks?${qs}` : "/tasks");
  }

  return (
    <div className="group-form">
      <label className="group-select">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
          <rect x="3" y="4" width="18" height="4" rx="1" />
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="3" y="16" width="18" height="4" rx="1" />
        </svg>
        <span>Group:</span>
        <select name="group" value={group} onChange={onChange}>
          {GROUP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

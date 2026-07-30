// apps/web/app/tasks/filter-bar.tsx
//
// Real filters for the Tasks page (the old Filter/Sort buttons were disabled
// placeholders and got removed). Asana-style: assignee (with Me / Unassigned
// shortcuts), priority, and project — all URL-persisted so filtered views
// are shareable and survive refresh. Changing a filter resets pagination.
//
// Campaign was added 2026-07-29 — "show me everything in the Diwali push,
// including the non-content work" is the question a media plan can't answer
// on its own. The select only appears when campaigns exist, so teams that
// don't run campaigns never see a dead control.

"use client";

import { useRouter } from "next/navigation";

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "med", label: "Medium" },
  { value: "low", label: "Low" },
];

export function FilterBar({
  view,
  group,
  q,
  assignee,
  priority,
  project,
  campaign,
  showClosed = false,
  users,
  projects,
  campaigns = [],
}: {
  view?: string;
  group: string;
  q: string;
  assignee: string;
  priority: string;
  project: string;
  campaign: string;
  showClosed?: boolean;
  users: Array<{ id: string; name: string }>;
  projects: Array<{ slug: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const active = Boolean(assignee || priority || project || campaign);

  function push(next: Partial<{ assignee: string; priority: string; project: string; campaign: string }>) {
    const merged = { assignee, priority, project, campaign, ...next };
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (group !== "due") params.set("group", group);
    if (q) params.set("q", q);
    if (merged.assignee) params.set("assignee", merged.assignee);
    if (merged.priority) params.set("priority", merged.priority);
    if (merged.project) params.set("project", merged.project);
    if (merged.campaign) params.set("campaign", merged.campaign);
    if (showClosed) params.set("closed", "1");
    const qs = params.toString();
    router.push(qs ? `/tasks?${qs}` : "/tasks");
  }

  return (
    <div className="filter-bar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" aria-hidden="true">
        <path d="M3 5h18M6 12h12M10 19h4" />
      </svg>
      <select
        aria-label="Filter by assignee"
        className={`filter-select ${assignee ? "on" : ""}`}
        value={assignee}
        onChange={(e) => push({ assignee: e.target.value })}
      >
        <option value="">Assignee: all</option>
        <option value="me">Me</option>
        <option value="none">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <select
        aria-label="Filter by priority"
        className={`filter-select ${priority ? "on" : ""}`}
        value={priority}
        onChange={(e) => push({ priority: e.target.value })}
      >
        <option value="">Priority: all</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>
      <select
        aria-label="Filter by project"
        className={`filter-select ${project ? "on" : ""}`}
        value={project}
        onChange={(e) => push({ project: e.target.value })}
      >
        <option value="">Project: all</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>{p.name}</option>
        ))}
      </select>
      {campaigns.length > 0 ? (
        <select
          aria-label="Filter by campaign"
          className={`filter-select ${campaign ? "on" : ""}`}
          value={campaign}
          onChange={(e) => push({ campaign: e.target.value })}
        >
          <option value="">Campaign: all</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : null}
      {active ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => push({ assignee: "", priority: "", project: "", campaign: "" })}>
          Clear
        </button>
      ) : null}
    </div>
  );
}

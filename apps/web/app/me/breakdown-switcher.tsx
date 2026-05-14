// apps/web/app/me/breakdown-switcher.tsx
//
// Client component: dropdown to switch between Department / Project / Team views.

"use client";

import { useState } from "react";
import Link from "next/link";
import type { BentoStats } from "./dashboard-action";

type View = "department" | "project" | "team";

export function BreakdownSwitcher({ stats, period = "week" }: { stats: BentoStats; period?: "week" | "month" }) {
  const [view, setView] = useState<View>("department");

  const hasData =
    (stats.deptBreakdown?.length ?? 0) > 0 ||
    (stats.projectBreakdown?.length ?? 0) > 0 ||
    (stats.teamBreakdown?.length ?? 0) > 0;

  if (!hasData) return null;

  return (
    <div className="bento-cell bento-span-4">
      <div className="bento-breakdown-head">
        <div className="bento-cell-label" style={{ margin: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Breakdown
        </div>
        <div className="bento-view-tabs">
          {(["department", "project", "team"] as const).map((v) => (
            <button
              key={v}
              className={`bento-view-tab ${view === v ? "active" : ""}`}
              onClick={() => setView(v)}
            >
              {v === "department" ? "Dept" : v === "project" ? "Project" : "Team"}
            </button>
          ))}
        </div>
      </div>

      {view === "department" && (
        <table className="bento-table">
          <thead>
            <tr>
              <th>Department</th>
              <th className="num">Members</th>
              <th className="num">Closed</th>
              <th className="num">Open</th>
              <th className="num">Created</th>
            </tr>
          </thead>
          <tbody>
            {(stats.deptBreakdown ?? []).map((d) => (
              <tr key={d.name}>
                <td>
                  <Link href={`/me/${period}/dept/${(d as any).id}`} className="bento-dept-link">
                    {d.color && <span className="bento-dept-dot" style={{ background: d.color }} />}
                    {d.name} →
                  </Link>
                </td>
                <td className="num mono">{d.members}</td>
                <td className="num mono">{d.closed}</td>
                <td className="num mono">{d.open}</td>
                <td className="num mono">{d.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === "project" && (
        <table className="bento-table">
          <thead>
            <tr>
              <th>Project</th>
              <th className="num">Closed</th>
              <th className="num">Open</th>
              <th className="num">Created</th>
            </tr>
          </thead>
          <tbody>
            {(stats.projectBreakdown ?? []).map((p) => (
              <tr key={p.slug}>
                <td><Link href={`/projects/${p.slug}`} className={`pchip ${p.slug}`}>{p.name}</Link></td>
                <td className="num mono">{p.closed}</td>
                <td className="num mono">{p.open}</td>
                <td className="num mono">{p.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === "team" && (
        <table className="bento-table">
          <thead>
            <tr>
              <th>Member</th>
              <th className="num">Closed</th>
              <th className="num">Comments</th>
              <th className="num">Created</th>
            </tr>
          </thead>
          <tbody>
            {(stats.teamBreakdown ?? []).map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td className="num mono">{m.closed}</td>
                <td className="num mono">{m.comments}</td>
                <td className="num mono">{m.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

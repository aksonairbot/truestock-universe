// apps/web/app/me/dept-bento.tsx
//
// Bento grid for a department dashboard — member, project, priority, daily views.

import Link from "next/link";
import type { DeptDashStats } from "./dashboard-action";

function fmtSignedDelta(now: number, prev: number): { label: string; cls: string } {
  if (prev === 0 && now === 0) return { label: "no change", cls: "trend-neutral" };
  if (prev === 0) return { label: "new", cls: "trend-up" };
  const delta = now - prev;
  if (delta === 0) return { label: "flat", cls: "trend-neutral" };
  const pct = Math.round((delta / prev) * 100);
  if (delta > 0) return { label: `+${delta} (${pct}%)`, cls: "trend-up" };
  return { label: `${delta} (${pct}%)`, cls: "trend-down" };
}

function dayLabel(d: string): string {
  return new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
}
function dayShort(d: string): string {
  return new Date(`${d}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" });
}

const PRIO_COLOR: Record<string, string> = {
  urgent: "#FCA5A5", high: "#F5B84A", med: "var(--text-2)", low: "var(--text-3)",
};
const PRIO_BG: Record<string, string> = {
  urgent: "rgba(248,113,113,0.18)", high: "rgba(245,184,74,0.18)",
  med: "var(--accent-wash)", low: "var(--border)",
};

export function DeptBento({ stats }: { stats: DeptDashStats }) {
  const delta = fmtSignedDelta(stats.closed, stats.closedPrev);
  const prioTotal = stats.priorityMix.reduce((s, p) => s + p.n, 0);
  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.closed + d.commented));

  return (
    <div className="bento">

      {/* Hero — closed */}
      <div className="bento-cell bento-span-2 bento-hero">
        <div className="bento-cell-label">Closed this {stats.period}</div>
        <div className="bento-hero-row">
          <div className="bento-mega">{stats.closed}</div>
          <div className={`trend ${delta.cls}`}>{delta.label}<span className="trend-vs">vs prior</span></div>
        </div>
        <div className="bento-foot">
          <span className="mono">{stats.daysActive}</span>/{stats.daily.length} active days · <span className="mono">{stats.open}</span> open · <span className="mono">{stats.created}</span> created
        </div>
      </div>

      {/* Comments */}
      <div className="bento-cell">
        <div className="bento-cell-label">Comments</div>
        <div className="bento-mega bento-mega-md">{stats.comments}</div>
        <div className="bento-foot">across {stats.members.length} members</div>
      </div>

      {/* Priority mix */}
      <div className="bento-cell">
        <div className="bento-cell-label">Priority mix</div>
        {prioTotal > 0 ? (
          <>
            <div className="bento-prio-stack" role="img" aria-label="priority mix">
              {stats.priorityMix.map((p) => {
                if (p.n === 0) return null;
                const w = (p.n / prioTotal) * 100;
                return <span key={p.priority} className="bento-prio-seg" style={{ width: `${w}%`, background: PRIO_COLOR[p.priority] }} title={`${p.priority}: ${p.n}`} />;
              })}
            </div>
            <div className="bento-prio-legend">
              {stats.priorityMix.map((p) => p.n > 0 ? (
                <span key={p.priority} className="bento-prio-tag" style={{ background: PRIO_BG[p.priority], color: PRIO_COLOR[p.priority] }}>
                  <span className="mono">{p.n}</span> {p.priority}
                </span>
              ) : null)}
            </div>
          </>
        ) : (
          <div className="text-text-3 italic text-sm">No closures.</div>
        )}
      </div>

      {/* Member breakdown — span 4 */}
      <div className="bento-cell bento-span-4">
        <div className="bento-cell-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /><path d="M21 21v-2a4 4 0 0 0-3-3.87" />
          </svg>
          Members
        </div>
        {stats.members.length > 0 ? (
          <table className="bento-table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="num">Closed</th>
                <th className="num">Open</th>
                <th className="num">Created</th>
                <th className="num">Comments</th>
              </tr>
            </thead>
            <tbody>
              {stats.members.map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/members/${m.id}`}>{m.name}</Link></td>
                  <td className="num mono">{m.closed}</td>
                  <td className="num mono">{m.open}</td>
                  <td className="num mono">{m.created}</td>
                  <td className="num mono">{m.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-text-3 italic text-sm">No members in this department.</div>
        )}
      </div>

      {/* Project mix — span 2 */}
      <div className="bento-cell bento-span-2">
        <div className="bento-cell-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Projects
        </div>
        {stats.projectMix.length > 0 ? (
          <table className="bento-table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Closed</th>
                <th className="num">Open</th>
              </tr>
            </thead>
            <tbody>
              {stats.projectMix.map((p) => (
                <tr key={p.slug}>
                  <td><Link href={`/projects/${p.slug}`} className={`pchip ${p.slug}`}>{p.name}</Link></td>
                  <td className="num mono">{p.closed}</td>
                  <td className="num mono">{p.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-text-3 italic text-sm">No project activity.</div>
        )}
      </div>

      {/* Daily activity heatmap — span 2 */}
      <div className="bento-cell bento-span-2">
        <div className="bento-cell-label">Daily activity · {stats.daily.length}d</div>
        <div className="bento-heatmap">
          {stats.daily.map((d, i) => {
            const intensity = (d.closed + d.commented) / maxDaily;
            const isLast = i === stats.daily.length - 1;
            return (
              <div key={d.day} className="bento-heatcell" title={`${dayShort(d.day)} · ${d.closed} closed, ${d.commented} comments`}>
                <div className={`bento-heatfill ${isLast ? "is-today" : ""}`} style={{ opacity: 0.12 + intensity * 0.88 }} />
                {stats.daily.length <= 7 ? <div className="bento-heatlabel">{dayLabel(d.day)[0]}</div> : null}
              </div>
            );
          })}
        </div>
        <div className="bento-foot">darker = more activity · today on the right</div>
      </div>
    </div>
  );
}

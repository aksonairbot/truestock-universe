// apps/web/app/me/bento.tsx
//
// Renders the bento grid for a personal weekly or monthly dashboard.
// Server component; consumes the cached stats + narrative.

import Link from "next/link";
import type { BentoStats } from "./dashboard-action";
import { BreakdownSwitcher } from "./breakdown-switcher";

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
  urgent: "rgba(248,113,113,0.18)",
  high:   "rgba(245,184,74,0.18)",
  med:    "var(--accent-wash)",
  low:    "var(--border)",
};

export function Bento({ stats, narrative, model, generatedAt, period }: {
  stats: BentoStats;
  narrative?: string;
  model?: string;
  generatedAt?: Date;
  period: "week" | "month";
}) {
  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.closed + d.commented));
  const delta = fmtSignedDelta(stats.closed, stats.closedPrev);
  const prioTotal = stats.priorityMix.reduce((s, p) => s + p.n, 0);
  const dowMax = Math.max(1, ...stats.dayOfWeek.map((d) => d.total));
  const trendMax = Math.max(1, ...stats.weeklyTrend.map((w) => w.closed));

  return (
    <div className="bento">

      {/* Hero closures — span 2 */}
      <div className="bento-cell bento-span-2 bento-hero">
        <div className="bento-cell-label">{period === "week" ? "Closed this week" : "Closed this month"}</div>
        <div className="bento-hero-row">
          <div className="bento-mega">{stats.closed}</div>
          <div className={`trend ${delta.cls}`}>{delta.label}<span className="trend-vs">vs prior</span></div>
        </div>
        <div className="bento-foot">
          <span className="mono">{stats.daysActive}</span>/{stats.daily.length} active days · <span className="mono">{stats.newCreated}</span> captured
        </div>
      </div>

      {/* Streak */}
      <div className="bento-cell bento-streak">
        <div className="bento-cell-label">Streak</div>
        <div className="bento-streak-row">
          <span className="streak-flame" aria-hidden="true">🔥</span>
          <span className="bento-mega bento-mega-md">{stats.streak}</span>
          <span className="bento-streak-units">day{stats.streak === 1 ? "" : "s"}</span>
        </div>
        <div className="bento-foot">best: <span className="mono">{stats.streakBest}</span></div>
      </div>

      {/* Comments engagement */}
      <div className="bento-cell">
        <div className="bento-cell-label">Comments</div>
        <div className="bento-twoline">
          <div className="bento-twoline-row">
            <span className="bento-mega bento-mega-sm">{stats.comments}</span>
            <span className="bento-twoline-lbl">sent</span>
          </div>
          <div className="bento-twoline-row">
            <span className="bento-mega bento-mega-sm">{stats.commentsReceived}</span>
            <span className="bento-twoline-lbl">received</span>
          </div>
        </div>
      </div>

      {/* AI narrative — span 4 */}
      {narrative ? (
        <div className="bento-cell bento-span-4 bento-narrative">
          <div className="bento-cell-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
              <path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8" />
            </svg>
            Your {period}
          </div>
          <div className="bento-narrative-body">{narrative}</div>
          {model || generatedAt ? (
            <div className="bento-foot">
              <span>{model}</span>
              {generatedAt ? <span> · {new Date(generatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Top 3 projects — span 2 */}
      <div className="bento-cell bento-span-2">
        <div className="bento-cell-label">Where your week landed</div>
        {stats.topProjects.length > 0 ? (
          <ul className="bento-proj-list">
            {stats.topProjects.map((p) => {
              const pct = stats.closed > 0 ? Math.round((p.closed / stats.closed) * 100) : 0;
              return (
                <li key={p.slug}>
                  <Link href={`/projects/${p.slug}`} className={`pchip ${p.slug}`}>{p.name}</Link>
                  <div className="bento-proj-bar"><div className="bento-proj-fill" style={{ width: `${Math.max(8, pct)}%` }} /></div>
                  <span className="bento-proj-n mono">{p.closed}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-text-3 italic text-sm">No closures yet this {period}.</div>
        )}
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
                return (
                  <span key={p.priority} className="bento-prio-seg" style={{ width: `${w}%`, background: PRIO_COLOR[p.priority] }} title={`${p.priority}: ${p.n}`} />
                );
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
          <div className="text-text-3 italic text-sm">No closures this {period}.</div>
        )}
      </div>

      {/* Day-of-week pattern */}
      <div className="bento-cell">
        <div className="bento-cell-label">Day-of-week rhythm</div>
        <div className="bento-dow">
          {stats.dayOfWeek.map((d) => (
            <div key={d.dow} className="bento-dow-col" title={`${d.label}: ${d.total} closures`}>
              <div className="bento-dow-bar" style={{ height: `${(d.total / dowMax) * 100}%` }} />
              <div className="bento-dow-lbl">{d.label[0]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 14/30 day activity heatmap — span 2 */}
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

      {/* Multi-week trend — span 2 */}
      <div className="bento-cell bento-span-2">
        <div className="bento-cell-label">{period === "week" ? "Trend · last 4 weeks" : "Trend · last 8 weeks"}</div>
        <div className="bento-trend">
          {stats.weeklyTrend.map((w, i) => {
            const h = (w.closed / trendMax) * 100;
            const isLast = i === stats.weeklyTrend.length - 1;
            return (
              <div key={w.weekKey} className="bento-trend-col" title={`${w.weekKey}: ${w.closed} closures`}>
                <div className="bento-trend-val mono">{w.closed}</div>
                <div className={`bento-trend-bar ${isLast ? "is-current" : ""}`} style={{ height: `${Math.max(4, h)}%` }} />
                <div className="bento-trend-lbl">{w.weekKey.slice(-3)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Oldest open */}
      <div className="bento-cell">
        <div className="bento-cell-label">Oldest open</div>
        {stats.oldestOpen ? (
          <>
            <Link href={`/tasks?task=${stats.oldestOpen.id}`} className="bento-task" scroll={false}>
              {stats.oldestOpen.title}
            </Link>
            <div className="bento-foot mt-1">
              <span className="pchip">{stats.oldestOpen.project}</span>
              <span className="ml-2 mono">{stats.oldestOpen.ageDays}d old</span>
            </div>
          </>
        ) : (
          <div className="text-text-3 italic text-sm">Nothing currently open.</div>
        )}
      </div>

      {/* Fastest closure */}
      <div className="bento-cell bento-fast">
        <div className="bento-cell-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
          </svg>
          Fastest closure
        </div>
        {stats.fastest ? (
          <>
            <Link href={`/tasks?task=${stats.fastest.id}`} className="bento-task" scroll={false}>
              {stats.fastest.title}
            </Link>
            <div className="bento-foot mt-1">
              <span className="pchip">{stats.fastest.project}</span>
              <span className="ml-2 mono">{stats.fastest.days}d</span>
            </div>
          </>
        ) : (
          <div className="text-text-3 italic text-sm">No closures with duration in window.</div>
        )}
      </div>

      {/* Slowest closure */}
      <div className="bento-cell bento-slow">
        <div className="bento-cell-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
          </svg>
          Slowest closure
        </div>
        {stats.slowest ? (
          <>
            <Link href={`/tasks?task=${stats.slowest.id}`} className="bento-task" scroll={false}>
              {stats.slowest.title}
            </Link>
            <div className="bento-foot mt-1">
              <span className="pchip">{stats.slowest.project}</span>
              <span className="ml-2 mono">{stats.slowest.days}d</span>
            </div>
          </>
        ) : (
          <div className="text-text-3 italic text-sm">No closures with duration in window.</div>
        )}
      </div>

      {/* Tough closures — span 4 */}
      <div className="bento-cell bento-span-4 bento-longer">
        <div className="bento-cell-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
            <path d="M12 2 15 9l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
          </svg>
          Tough closures · {stats.longerThanMedian.length}
        </div>
        {stats.longerThanMedian.length > 0 ? (
          <ul className="bento-longer-list">
            {stats.longerThanMedian.map((t) => (
              <li key={t.id}>
                <Link href={`/tasks?task=${t.id}`} className="bento-task" scroll={false}>{t.title}</Link>
                <span className="bento-foot ml-2"><span className="mono">{t.days}d</span> vs median <span className="mono">{t.medianDays}d</span> · {t.project}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-text-3 italic text-sm">
            Nothing exceeded its project median this {period}. Either quick closures across the board, or no big lifts in window.
          </div>
        )}
      </div>

      {/* Breakdown switcher — Dept / Project / Team */}
      <BreakdownSwitcher stats={stats} period={period} />
    </div>
  );
}

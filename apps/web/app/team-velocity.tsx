// apps/web/app/team-velocity.tsx
//
// Team Velocity strip on the home page. Answers "is the team closing things?"
// at three time windows in one glance:
//   • Today        — closures since IST midnight
//   • This week    — trailing 7 days
//   • This month   — trailing 30 days
//
// Plus a 14-day daily-closures sparkline (subtle, no axes) and the top 3
// closers this week. Each number carries a tiny trend chip vs the prior
// equal-length window so a flat week is obvious.

import Link from "next/link";
import { getDb, tasks, users, eq, and, sql } from "@tu/db";

const TZ = "Asia/Kolkata";

function istDayString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function startOfDayIST(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`);
}
function shiftIST(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00+05:30`);
  d.setDate(d.getDate() + n);
  return istDayString(d);
}

function trendChip(now: number, prev: number): { label: string; cls: string } {
  if (prev === 0 && now === 0) return { label: "—", cls: "trend-neutral" };
  if (prev === 0) return { label: "↑ new", cls: "trend-up" };
  const delta = now - prev;
  const pct = Math.round((delta / prev) * 100);
  if (pct >= 10) return { label: `↑ ${pct}%`, cls: "trend-up" };
  if (pct <= -10) return { label: `↓ ${Math.abs(pct)}%`, cls: "trend-down" };
  return { label: "≈", cls: "trend-neutral" };
}

export async function TeamVelocity() {
  const db = getDb();
  const today = istDayString(new Date());
  const startToday = startOfDayIST(today);
  const start7d = startOfDayIST(shiftIST(today, -6));
  const start30d = startOfDayIST(shiftIST(today, -29));
  const start14d = startOfDayIST(shiftIST(today, -13));
  const startPrev7d = startOfDayIST(shiftIST(today, -13)); // covers d-13 .. d-7
  const endPrev7d = startOfDayIST(shiftIST(today, -7));
  const startPrev30d = startOfDayIST(shiftIST(today, -59));
  const endPrev30d = startOfDayIST(shiftIST(today, -30));
  const startYesterday = startOfDayIST(shiftIST(today, -1));
  const endYesterday = startOfDayIST(today);

  // Single-shot scalars.
  const [todayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${startToday.toISOString()}`));
  const [yesterdayRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${startYesterday.toISOString()} and ${tasks.completedAt} < ${endYesterday.toISOString()}`));
  const [d7Row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${start7d.toISOString()}`));
  const [prev7Row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${startPrev7d.toISOString()} and ${tasks.completedAt} < ${endPrev7d.toISOString()}`));
  const [d30Row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${start30d.toISOString()}`));
  const [prev30Row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${startPrev30d.toISOString()} and ${tasks.completedAt} < ${endPrev30d.toISOString()}`));

  const dToday = todayRow?.n ?? 0;
  const dYesterday = yesterdayRow?.n ?? 0;
  const d7 = d7Row?.n ?? 0;
  const dPrev7 = prev7Row?.n ?? 0;
  const d30 = d30Row?.n ?? 0;
  const dPrev30 = prev30Row?.n ?? 0;

  // 14-day daily sparkline.
  const dailyRows = await db.execute(sql<{ d: string; n: number }>`
    select (completed_at at time zone 'Asia/Kolkata')::date::text as d,
           count(*)::int as n
    from tasks
    where status = 'done'
      and completed_at >= ${start14d.toISOString()}
    group by d
    order by d
  `);
  const dailyMap = new Map<string, number>();
  for (const r of (dailyRows as unknown as Array<{ d: string; n: number }>)) {
    dailyMap.set(r.d.toString().slice(0, 10), Number(r.n) || 0);
  }
  const sparkDays: Array<{ d: string; n: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const day = shiftIST(today, -i);
    sparkDays.push({ d: day, n: dailyMap.get(day) ?? 0 });
  }
  const sparkMax = Math.max(1, ...sparkDays.map((s) => s.n));

  // Top closers this week.
  const closers = await db
    .select({
      userId: users.id,
      name: users.name,
      n: sql<number>`count(*)::int`.as("n"),
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(eq(tasks.status, "done"), sql`${tasks.completedAt} >= ${start7d.toISOString()}`))
    .groupBy(users.id, users.name)
    .orderBy(sql`count(*) desc`)
    .limit(3);

  const todayTrend = trendChip(dToday, dYesterday);
  const week7Trend = trendChip(d7, dPrev7);
  const week30Trend = trendChip(d30, dPrev30);

  return (
    <section className="velocity">
      <div className="velocity-head">
        <div>
          <div className="page-title" style={{ fontSize: 18 }}>Team velocity</div>
          <div className="page-sub" style={{ fontSize: 12 }}>
            Closures by window — vs the prior equal-length period.
          </div>
        </div>
      </div>

      <div className="velocity-grid">
        <div className="velocity-card">
          <div className="velocity-label">Closed today</div>
          <div className="velocity-val">{dToday}</div>
          <div className={`trend ${todayTrend.cls}`}>{todayTrend.label}<span className="trend-vs">vs yesterday</span></div>
        </div>
        <div className="velocity-card">
          <div className="velocity-label">Closed · 7 days</div>
          <div className="velocity-val">{d7}</div>
          <div className={`trend ${week7Trend.cls}`}>{week7Trend.label}<span className="trend-vs">vs prior 7d</span></div>
        </div>
        <div className="velocity-card">
          <div className="velocity-label">Closed · 30 days</div>
          <div className="velocity-val">{d30}</div>
          <div className={`trend ${week30Trend.cls}`}>{week30Trend.label}<span className="trend-vs">vs prior 30d</span></div>
        </div>
        <div className="velocity-card velocity-spark">
          <div className="velocity-label">14-day daily closes</div>
          <Sparkline days={sparkDays} max={sparkMax} />
        </div>
      </div>

      {closers.length > 0 ? (
        <div className="closers">
          <span className="closers-label">Top closers this week:</span>
          {closers.map((c, i) => (
            <Link key={c.userId} href={`/members/${c.userId}`} className={`closer-chip rank-${i + 1}`}>
              <span className="closer-rank">{i + 1}</span>
              <span className="closer-name">{c.name}</span>
              <span className="closer-n">{c.n}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sparkline — inline SVG, no library. Pure bars.
// ---------------------------------------------------------------------------
function Sparkline({ days, max }: { days: Array<{ d: string; n: number }>; max: number }) {
  const W = 220;
  const H = 36;
  const gap = 2;
  const barW = (W - gap * (days.length - 1)) / days.length;
  return (
    <svg
      role="img"
      aria-label={`Daily closures over the last 14 days`}
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      {days.map((d, i) => {
        const h = max === 0 ? 0 : Math.max(2, (d.n / max) * (H - 2));
        const x = i * (barW + gap);
        const y = H - h;
        const isLast = i === days.length - 1;
        return (
          <rect
            key={d.d}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx={1.5}
            fill={isLast ? "var(--accent-2)" : "var(--accent)"}
            opacity={isLast ? 0.95 : 0.55}
          >
            <title>{d.d}: {d.n}</title>
          </rect>
        );
      })}
    </svg>
  );
}

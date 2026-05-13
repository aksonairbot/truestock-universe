import Link from "next/link";
import { getOrGenerateDashboard, refreshDashboard } from "../dashboard-action";
import { Bento } from "../bento";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function MyMonthPage() {
  const me = await getCurrentUser();
  const r = await getOrGenerateDashboard("month");

  if (!r.ok || !r.stats) {
    return (
      <div className="page-content max-w-[1100px]">
        <div className="page-head">
          <div>
            <div className="page-title">My month</div>
            <div className="page-sub">Couldn't generate dashboard. {r.error ? <span className="text-text-4">({r.error})</span> : null}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content max-w-[1100px]">
      <div className="page-head">
        <div>
          <div className="page-title">My month · {me.name.split(/\s+/)[0]}</div>
          <div className="page-sub">{r.stats.rangeLabel} · {r.cached ? "cached" : "fresh"}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/me/week" className="btn btn-ghost btn-sm">← Week</Link>
          <form action={refreshDashboard}>
            <input type="hidden" name="period" value="month" />
            <button type="submit" className="btn btn-ghost btn-sm" title="Regenerate this month's dashboard">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13" style={{ verticalAlign: "-2px", marginRight: 6 }}>
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Refresh
            </button>
          </form>
        </div>
      </div>

      <Bento
        stats={r.stats}
        narrative={r.narrative}
        model={r.model}
        generatedAt={r.generatedAt}
        period="month"
      />
    </div>
  );
}

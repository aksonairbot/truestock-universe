import Link from "next/link";
import { getDeptDashboard, getAllDepartments } from "../../../dashboard-action";
import { DeptBento } from "../../../dept-bento";

export const dynamic = "force-dynamic";

export default async function DeptMonthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r, allDepts] = await Promise.all([getDeptDashboard(id, "month"), getAllDepartments()]);

  if (!r.ok || !r.stats) {
    return (
      <div className="page-content max-w-[1100px]">
        <div className="page-head">
          <div>
            <div className="page-title">Department month</div>
            <div className="page-sub">Couldn't load. {r.error ? <span className="text-text-4">({r.error})</span> : null}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content max-w-[1100px]">
      <div className="page-head">
        <div>
          <div className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {r.stats.deptColor && <span style={{ width: 10, height: 10, borderRadius: "50%", background: r.stats.deptColor, display: "inline-block" }} />}
            {r.stats.deptName} · Month
          </div>
          <div className="page-sub">{r.stats.rangeLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/me/week/dept/${id}`} className="btn btn-ghost btn-sm">← Week</Link>
          <Link href="/me/month" className="btn btn-ghost btn-sm">← My month</Link>
        </div>
      </div>

      {/* Dept navigation */}
      <div className="dept-nav">
        {allDepts.map((d) => (
          <Link
            key={d.id}
            href={`/me/month/dept/${d.id}`}
            className={`dept-nav-chip ${d.id === id ? "active" : ""}`}
            style={d.id === id && d.color ? { borderColor: d.color, background: `${d.color}18` } : undefined}
          >
            {d.color && <span className="bento-dept-dot" style={{ background: d.color }} />}
            {d.name}
          </Link>
        ))}
      </div>

      <DeptBento stats={r.stats} />
    </div>
  );
}

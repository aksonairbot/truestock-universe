// apps/web/app/reviews/page.tsx
//
// Reviews landing page.
// Admin/manager: sees all cycles + can create new ones.
// Member: sees open cycles where they have a response to fill.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, reviewCycles, reviewResponses, users, eq, and, desc, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, isAdmin, getDepartmentScope } from "@/lib/access";
import { createReviewCycle } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "var(--text-3)",
  open: "var(--success)",
  closed: "var(--warning)",
};

export default async function ReviewsPage() {
  const me = await getCurrentUser();
  const db = getDb();
  const privileged = isPrivileged(me);
  const amAdmin = isAdmin(me);
  const deptScope = getDepartmentScope(me);

  // Fetch cycles with response stats scoped by hierarchy
  // Admin: counts all responses
  // Manager: counts only responses from their department
  const deptFilter = !amAdmin && deptScope
    ? sql` and user_id in (select id from users where department_id = ${deptScope})`
    : sql``;

  const cycles = await db
    .select({
      id: reviewCycles.id,
      name: reviewCycles.name,
      fyStart: reviewCycles.fyStart,
      fyEnd: reviewCycles.fyEnd,
      deadline: reviewCycles.deadline,
      status: reviewCycles.status,
      createdAt: reviewCycles.createdAt,
      total: sql<number>`(select count(*)::int from review_responses where cycle_id = ${reviewCycles.id}${deptFilter})`,
      submitted: sql<number>`(select count(*)::int from review_responses where cycle_id = ${reviewCycles.id} and status = 'submitted'${deptFilter})`,
    })
    .from(reviewCycles)
    .orderBy(desc(reviewCycles.createdAt));

  // For non-privileged users, get their own responses
  // For managers, also get their own response (so they can fill it too)
  const myResponses = await db
    .select({
      id: reviewResponses.id,
      cycleId: reviewResponses.cycleId,
      status: reviewResponses.status,
    })
    .from(reviewResponses)
    .where(eq(reviewResponses.userId, me.id));

  const myResponseMap = new Map(myResponses.map((r) => [r.cycleId, r]));

  // Visibility:
  // Admin: all cycles
  // Manager: all cycles (but stats scoped to their dept)
  // Member: only open/closed cycles where they have a response
  const visibleCycles = privileged
    ? cycles
    : cycles.filter((c) => (c.status === "open" || c.status === "closed") && myResponseMap.has(c.id));

  return (
    <div className="page-content">
      <div className="page-head">
        <h1 className="page-title">Yearly Reviews</h1>
        <p className="page-sub">
          {privileged
            ? "Manage review cycles and track team progress."
            : "Fill in your yearly review forms."}
        </p>
      </div>

      {/* Cycle list */}
      {visibleCycles.length > 0 ? (
        <table className="tbl" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Cycle</th>
              <th>Period</th>
              <th>Deadline</th>
              <th>Status</th>
              {privileged && <th>Progress</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleCycles.map((c) => {
              const myResp = myResponseMap.get(c.id);
              return (
                <tr key={c.id} className="row-link">
                  <td>
                    <Link href={`/reviews/${c.id}`} className="text-text hover:text-accent-2 transition">
                      {c.name}
                    </Link>
                  </td>
                  <td className="mono text-text-2 text-[12px]">
                    {c.fyStart} → {c.fyEnd}
                  </td>
                  <td className="text-text-2 text-[12px]">
                    {c.deadline
                      ? new Date(c.deadline).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td>
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider"
                      style={{ color: STATUS_COLOR[c.status] ?? "var(--text-3)" }}
                    >
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  {privileged && (
                    <td className="mono text-[12px]">
                      <span className="text-success">{c.submitted}</span>
                      <span className="text-text-3"> / {c.total}</span>
                    </td>
                  )}
                  <td>
                    {myResp && myResp.status !== "submitted" && c.status === "open" && (
                      <Link
                        href={`/reviews/fill/${myResp.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        Fill Review
                      </Link>
                    )}
                    {myResp?.status === "submitted" && (
                      <span className="text-[11px] text-success font-medium">Submitted ✓</span>
                    )}
                    {privileged && !myResp && (
                      <Link href={`/reviews/${c.id}`} className="btn btn-sm">
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="mt-8 text-text-3 text-center py-12">
          {privileged
            ? "No review cycles yet. Create one below."
            : "No reviews pending for you right now."}
        </div>
      )}

      {/* Create cycle form — admin only */}
      {me.role === "admin" && (
        <div className="mt-10 border border-border rounded-xl p-6 bg-panel max-w-lg">
          <h2 className="text-[14px] font-semibold text-text mb-4">Create New Review Cycle</h2>
          <form action={createReviewCycle} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-text-2 uppercase tracking-wider font-medium">
                Cycle Name
              </span>
              <input
                name="name"
                type="text"
                required
                placeholder="e.g. FY 2025-26 Yearly Review"
                className="bg-bg-2 border border-border rounded-md px-3 py-2 text-[13px] text-text placeholder:text-text-4 focus:border-accent outline-none"
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] text-text-2 uppercase tracking-wider font-medium">
                  FY Start
                </span>
                <input
                  name="fyStart"
                  type="date"
                  required
                  defaultValue="2025-04-01"
                  className="bg-bg-2 border border-border rounded-md px-3 py-2 text-[13px] text-text focus:border-accent outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] text-text-2 uppercase tracking-wider font-medium">
                  FY End
                </span>
                <input
                  name="fyEnd"
                  type="date"
                  required
                  defaultValue="2026-03-31"
                  className="bg-bg-2 border border-border rounded-md px-3 py-2 text-[13px] text-text focus:border-accent outline-none"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-text-2 uppercase tracking-wider font-medium">
                Submission Deadline
              </span>
              <input
                name="deadline"
                type="datetime-local"
                className="bg-bg-2 border border-border rounded-md px-3 py-2 text-[13px] text-text focus:border-accent outline-none"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm mt-2 self-start">
              Create Cycle
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

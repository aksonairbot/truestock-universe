// apps/web/app/reviews/[cycleId]/page.tsx
//
// Cycle detail page.
// Admin: sees all member responses + progress, can open/close cycle,
//        click a member row to read their answers.
// Member: redirected to their own fill page if the cycle is open.

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  getDb,
  reviewCycles,
  reviewQuestions,
  reviewResponses,
  users,
  eq,
  and,
  asc,
  sql,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, isAdmin, getDepartmentScope } from "@/lib/access";
import { openReviewCycle, closeReviewCycle } from "../actions";

export const dynamic = "force-dynamic";

const RESP_STATUS_LABEL: Record<string, string> = {
  pending: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};
const RESP_STATUS_COLOR: Record<string, string> = {
  pending: "var(--text-3)",
  in_progress: "var(--warning)",
  submitted: "var(--success)",
};

interface PageProps {
  params: Promise<{ cycleId: string }>;
}

export default async function CycleDetailPage({ params }: PageProps) {
  const { cycleId } = await params;
  const me = await getCurrentUser();
  const db = getDb();

  const [cycle] = await db
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.id, cycleId))
    .limit(1);

  if (!cycle) notFound();

  // Non-privileged user → redirect to their fill page
  if (!isPrivileged(me)) {
    const [myResp] = await db
      .select({ id: reviewResponses.id })
      .from(reviewResponses)
      .where(and(eq(reviewResponses.cycleId, cycleId), eq(reviewResponses.userId, me.id)))
      .limit(1);
    if (myResp) redirect(`/reviews/fill/${myResp.id}`);
    redirect("/reviews");
  }

  // Check if this admin/manager also has their own pending response
  const [myResp] = await db
    .select({ id: reviewResponses.id, status: reviewResponses.status })
    .from(reviewResponses)
    .where(and(eq(reviewResponses.cycleId, cycleId), eq(reviewResponses.userId, me.id)))
    .limit(1);

  // Hierarchy-based visibility:
  // Admin → sees all responses
  // Manager → sees only responses from users in their department
  const deptScope = getDepartmentScope(me);
  const amAdmin = isAdmin(me);

  const allResponses = await db
    .select({
      responseId: reviewResponses.id,
      userId: reviewResponses.userId,
      status: reviewResponses.status,
      submittedAt: reviewResponses.submittedAt,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role,
      userDeptId: users.departmentId,
    })
    .from(reviewResponses)
    .innerJoin(users, eq(reviewResponses.userId, users.id))
    .where(eq(reviewResponses.cycleId, cycleId))
    .orderBy(users.name);

  // Filter: managers see only their department members
  const responses = amAdmin
    ? allResponses
    : allResponses.filter((r) => r.userDeptId === deptScope);

  const questions = await db
    .select()
    .from(reviewQuestions)
    .where(eq(reviewQuestions.cycleId, cycleId))
    .orderBy(asc(reviewQuestions.orderIndex));

  const submitted = responses.filter((r) => r.status === "submitted").length;
  const total = responses.length;

  return (
    <div className="page-content">
      <div className="page-head">
        <Link href="/reviews" className="text-[11px] text-text-3 hover:text-text transition mb-1 inline-block">
          ← Reviews
        </Link>
        <h1 className="page-title">{cycle.name}</h1>
        <p className="page-sub">
          {cycle.fyStart} → {cycle.fyEnd}
          {cycle.deadline && (
            <span className="ml-3 text-text-3">
              Deadline:{" "}
              {new Date(cycle.deadline).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </p>
      </div>

      {/* Status + actions bar */}
      <div className="flex items-center gap-4 mt-4 mb-6">
        <span
          className="text-[12px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{
            color: cycle.status === "open" ? "var(--success)" : cycle.status === "closed" ? "var(--warning)" : "var(--text-3)",
            background: cycle.status === "open" ? "var(--success-wash)" : "transparent",
          }}
        >
          {cycle.status}
        </span>

        {total > 0 && (
          <span className="text-[13px] text-text-2">
            <span className="text-success font-semibold">{submitted}</span> / {total} submitted
          </span>
        )}

        <div className="flex-1" />

        {me.role === "admin" && cycle.status === "draft" && (
          <form action={openReviewCycle}>
            <input type="hidden" name="cycleId" value={cycleId} />
            <button type="submit" className="btn btn-primary btn-sm">
              Open for Responses
            </button>
          </form>
        )}
        {me.role === "admin" && cycle.status === "open" && (
          <form action={closeReviewCycle}>
            <input type="hidden" name="cycleId" value={cycleId} />
            <button type="submit" className="btn btn-sm" style={{ borderColor: "var(--warning)", color: "var(--warning)" }}>
              Close Cycle
            </button>
          </form>
        )}
      </div>

      {/* Prompt for admin/manager to fill their own review */}
      {myResp && myResp.status !== "submitted" && cycle.status === "open" && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-accent bg-accent-wash">
          <span className="text-[13px] text-text">You haven't filled your own review yet.</span>
          <Link href={`/reviews/fill/${myResp.id}`} className="btn btn-primary btn-sm">
            Fill Your Review
          </Link>
        </div>
      )}

      {/* Questions overview */}
      {questions.length > 0 && (
        <div className="mb-6 border border-border rounded-lg p-4 bg-panel">
          <h3 className="text-[12px] text-text-3 uppercase tracking-wider font-medium mb-2">
            Questions ({questions.length})
          </h3>
          <ol className="flex flex-col gap-1.5">
            {questions.map((q, i) => (
              <li key={q.id} className="text-[13px] text-text-2">
                <span className="text-accent mono mr-2">{i + 1}.</span>
                {q.questionText}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Responses table */}
      {total > 0 ? (
        <table className="tbl">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Status</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {responses.map((r) => (
              <tr key={r.responseId} className="row-link">
                <td>
                  <div className="flex items-center gap-2">
                    <div
                      className={`tava ${avaClass(r.userName)}`}
                      style={{ width: 24, height: 24, fontSize: 10 }}
                    >
                      {avaInitials(r.userName)}
                    </div>
                    <div>
                      <div className="text-[13px] text-text">{r.userName}</div>
                      <div className="text-[11px] text-text-3">{r.userEmail}</div>
                    </div>
                  </div>
                </td>
                <td className="text-[12px] text-text-3 capitalize">{r.userRole}</td>
                <td>
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: RESP_STATUS_COLOR[r.status] ?? "var(--text-3)" }}
                  >
                    {RESP_STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
                <td className="text-[12px] text-text-3">
                  {r.submittedAt
                    ? new Date(r.submittedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td>
                  {r.status === "submitted" && (
                    <Link
                      href={`/reviews/${cycleId}/response/${r.responseId}`}
                      className="text-[11px] text-accent-2 hover:text-accent transition"
                    >
                      Read →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-text-3 text-center py-12">
          {cycle.status === "draft"
            ? "Open this cycle to create response forms for all active members."
            : "No responses yet."}
        </div>
      )}
    </div>
  );
}

// ── Avatar helpers (same as members page) ──
function avaClass(name?: string | null): string {
  if (!name) return "h1";
  const sum = [...name].reduce((s, c) => s + c.charCodeAt(0), 0);
  return ["h1", "h2", "h3", "h4"][sum % 4]!;
}
function avaInitials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

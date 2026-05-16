// apps/web/app/reviews/[cycleId]/response/[responseId]/page.tsx
//
// Read-only view of a member's submitted review. Admin/manager only.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getDb,
  reviewCycles,
  reviewQuestions,
  reviewResponses,
  reviewAttachments,
  users,
  eq,
  asc,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged, isAdmin, getDepartmentScope } from "@/lib/access";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ cycleId: string; responseId: string }>;
}

export default async function ResponseReadPage({ params }: PageProps) {
  const { cycleId, responseId } = await params;
  const me = await getCurrentUser();
  if (!isPrivileged(me)) redirect("/reviews");

  const db = getDb();

  const [resp] = await db
    .select({
      id: reviewResponses.id,
      cycleId: reviewResponses.cycleId,
      userId: reviewResponses.userId,
      status: reviewResponses.status,
      answers: reviewResponses.answers,
      submittedAt: reviewResponses.submittedAt,
      userName: users.name,
      userEmail: users.email,
      userDeptId: users.departmentId,
    })
    .from(reviewResponses)
    .innerJoin(users, eq(reviewResponses.userId, users.id))
    .where(eq(reviewResponses.id, responseId))
    .limit(1);

  if (!resp || resp.cycleId !== cycleId) notFound();

  // Hierarchy check: managers can only view responses from their department
  if (!isAdmin(me)) {
    const deptScope = getDepartmentScope(me);
    if (deptScope && resp.userDeptId !== deptScope) {
      redirect(`/reviews/${cycleId}`);
    }
  }

  const [cycle] = await db
    .select({ name: reviewCycles.name })
    .from(reviewCycles)
    .where(eq(reviewCycles.id, cycleId))
    .limit(1);

  const [questions, attachments] = await Promise.all([
    db
      .select()
      .from(reviewQuestions)
      .where(eq(reviewQuestions.cycleId, cycleId))
      .orderBy(asc(reviewQuestions.orderIndex)),
    db
      .select({
        id: reviewAttachments.id,
        filename: reviewAttachments.filename,
        mime: reviewAttachments.mime,
        sizeBytes: reviewAttachments.sizeBytes,
      })
      .from(reviewAttachments)
      .where(eq(reviewAttachments.responseId, responseId))
      .orderBy(asc(reviewAttachments.createdAt)),
  ]);

  const answers = (resp.answers ?? {}) as Record<string, string>;

  return (
    <div className="page-content max-w-3xl">
      <div className="page-head">
        <Link
          href={`/reviews/${cycleId}`}
          className="text-[11px] text-text-3 hover:text-text transition mb-1 inline-block"
        >
          ← {cycle?.name ?? "Back"}
        </Link>
        <h1 className="page-title">{resp.userName}'s Review</h1>
        <p className="page-sub">
          {resp.userEmail}
          {resp.submittedAt && (
            <span className="ml-3 text-text-3">
              Submitted{" "}
              {new Date(resp.submittedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </p>
      </div>

      {resp.status !== "submitted" && (
        <div
          className="mt-4 mb-6 px-4 py-3 rounded-lg border text-[13px]"
          style={{ borderColor: "var(--warning)", color: "var(--warning)", background: "rgba(245,184,74,0.06)" }}
        >
          This review has not been submitted yet (status: {resp.status}).
        </div>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {questions.map((q, i) => {
          const parts = (q.helpText ?? "").split("§§");
          let section: string | null = null;
          let qType = "text";
          let help: string | null = q.helpText;
          if (parts.length === 3) {
            section = parts[0]!;
            qType = parts[1]!;
            help = parts[2]!;
          } else if (parts.length === 2) {
            section = parts[0]!;
            help = parts[1]!;
          }

          const prevParts = i > 0 ? (questions[i - 1]?.helpText ?? "").split("§§") : [];
          const prevSection = prevParts.length >= 2 ? prevParts[0] : null;
          const showSection = section && section !== prevSection;

          // For rating questions, answer is "rating|justification"
          const rawAnswer = answers[q.id] ?? "";
          const isRating = qType === "rating" && rawAnswer.includes("|");
          const ratingValue = isRating ? rawAnswer.split("|")[0] : null;
          const justification = isRating ? rawAnswer.split("|").slice(1).join("|") : null;

          return (
          <div key={q.id}>
            {showSection && (
              <div className="mt-4 mb-3 pb-2 border-b border-border">
                <h2 className="text-[13px] font-semibold text-accent-2 uppercase tracking-wider">
                  {section}
                </h2>
              </div>
            )}
            <div className="flex items-start gap-2 mb-2">
              <span className="text-accent mono text-[13px] font-bold mt-0.5">{i + 1}.</span>
              <div>
                <p className="text-[14px] text-text font-medium">{q.questionText}</p>
                {help && (
                  <p className="text-[11px] text-text-3 mt-0.5">{help}</p>
                )}
              </div>
            </div>
            {isRating ? (
              <div className="ml-6 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <div
                      key={n}
                      className="w-9 h-9 rounded-lg border flex items-center justify-center text-[13px] font-semibold"
                      style={{
                        borderColor: String(n) === ratingValue ? "var(--accent)" : "var(--border)",
                        background: String(n) === ratingValue ? "var(--accent-wash)" : "var(--bg-2)",
                        color: String(n) === ratingValue ? "var(--accent)" : "var(--text-4)",
                      }}
                    >
                      {n}
                    </div>
                  ))}
                  <span className="ml-3 text-[18px] font-bold text-accent mono">{ratingValue}/10</span>
                </div>
                {justification && (
                  <div className="border border-border rounded-lg p-4 bg-bg-2 text-[13px] text-text leading-relaxed whitespace-pre-wrap">
                    {justification}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="ml-6 border border-border rounded-lg p-4 bg-bg-2 text-[13px] text-text leading-relaxed whitespace-pre-wrap"
              >
                {rawAnswer || (
                  <span className="text-text-4 italic">No answer provided.</span>
                )}
              </div>
            )}
          </div>
          );
        })}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="mt-8 pt-4 border-t border-border">
            <h3 className="text-[13px] font-semibold text-text-2 mb-3 flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Supporting Documents
            </h3>
            <div className="attachment-list">
              {attachments.map((a) => {
                const ext = a.filename.split(".").pop()?.toLowerCase() ?? "";
                const icon = a.mime === "application/pdf" ? "📄"
                  : ["ppt", "pptx"].includes(ext) ? "📑"
                  : ["doc", "docx"].includes(ext) ? "📝"
                  : ["xls", "xlsx"].includes(ext) ? "📊"
                  : a.mime?.startsWith("image/") ? "🖼" : "📎";
                const size = Number(a.sizeBytes);
                const sizeStr = size < 1024 * 1024
                  ? `${(size / 1024).toFixed(1)} KB`
                  : `${(size / (1024 * 1024)).toFixed(1)} MB`;
                return (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}?type=review`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="attachment-item"
                    title={`${a.filename} · ${sizeStr}`}
                  >
                    <span className="attachment-icon">{icon}</span>
                    <span className="attachment-name">{a.filename}</span>
                    <span className="attachment-size">{sizeStr}</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

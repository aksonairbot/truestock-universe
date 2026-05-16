// apps/web/app/reviews/fill/[responseId]/page.tsx
//
// The form a member fills out for their yearly review.
// Shows the 5 questions with textareas. Two actions: Save Draft / Submit.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getDb,
  reviewCycles,
  reviewQuestions,
  reviewResponses,
  reviewAttachments,
  eq,
  and,
  asc,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { saveReviewResponse } from "../../actions";
import SubmitButton from "./submit-button";
import { ReviewAttachments } from "../../review-attachments";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ responseId: string }>;
}

export default async function FillReviewPage({ params }: PageProps) {
  const { responseId } = await params;
  const me = await getCurrentUser();
  const db = getDb();

  // Fetch response + verify ownership
  const [resp] = await db
    .select()
    .from(reviewResponses)
    .where(eq(reviewResponses.id, responseId))
    .limit(1);

  if (!resp) notFound();
  if (resp.userId !== me.id) redirect("/reviews");
  if (resp.status === "submitted") redirect(`/reviews/${resp.cycleId}`);

  // Fetch cycle
  const [cycle] = await db
    .select()
    .from(reviewCycles)
    .where(eq(reviewCycles.id, resp.cycleId))
    .limit(1);

  if (!cycle || cycle.status !== "open") {
    redirect("/reviews");
  }

  // Fetch questions + existing attachments
  const [questions, existingAttachments] = await Promise.all([
    db
      .select()
      .from(reviewQuestions)
      .where(eq(reviewQuestions.cycleId, resp.cycleId))
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
          href="/reviews"
          className="text-[11px] text-text-3 hover:text-text transition mb-1 inline-block"
        >
          ← Reviews
        </Link>
        <h1 className="page-title">{cycle.name}</h1>
        <p className="page-sub">
          Review period: {cycle.fyStart} → {cycle.fyEnd}
          {cycle.deadline && (
            <span className="ml-3 text-warning">
              Due by{" "}
              {new Date(cycle.deadline).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </p>
      </div>

      {resp.status === "in_progress" && (
        <div
          className="mt-4 mb-2 px-4 py-2.5 rounded-lg border text-[12px]"
          style={{ borderColor: "var(--info)", color: "var(--info)", background: "rgba(96,165,250,0.06)" }}
        >
          You have a saved draft. Continue where you left off and submit when ready.
        </div>
      )}

      <form className="mt-6 flex flex-col gap-6">
        <input type="hidden" name="responseId" value={responseId} />

        {questions.map((q, i) => {
          // Parse encoded helpText: "section§§type§§help" or legacy "section§§help"
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

          // Show section header when it changes
          const prevParts = i > 0 ? (questions[i - 1]?.helpText ?? "").split("§§") : [];
          const prevSection = prevParts.length >= 2 ? prevParts[0] : null;
          const showSection = section && section !== prevSection;

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
              <span className="text-accent mono text-[14px] font-bold mt-0.5">{i + 1}.</span>
              <div>
                <p className="text-[14px] text-text font-medium leading-snug">
                  {q.questionText}
                </p>
                {help && (
                  <p className="text-[11px] text-text-3 mt-1 leading-relaxed">{help}</p>
                )}
              </div>
            </div>
            <div className="ml-6">
              {qType === "rating" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <label key={n} className="relative cursor-pointer">
                        <input
                          type="radio"
                          name={`q_${q.id}_rating`}
                          value={String(n)}
                          defaultChecked={answers[q.id]?.split("|")[0] === String(n)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-9 rounded-lg border border-border bg-bg-2 flex items-center justify-center text-[13px] font-semibold text-text-3 peer-checked:border-accent peer-checked:bg-accent-wash peer-checked:text-accent transition-all hover:border-border-3">
                          {n}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-text-4 px-1" style={{ maxWidth: 378 }}>
                    <span>Underperformed</span>
                    <span>Met expectations</span>
                    <span>Exceptional</span>
                  </div>
                  <textarea
                    name={`q_${q.id}_justification`}
                    rows={3}
                    defaultValue={answers[q.id]?.split("|").slice(1).join("|") ?? ""}
                    placeholder="Briefly justify your rating…"
                    className="w-full bg-bg-2 border border-border rounded-lg px-4 py-3 text-[13px] text-text placeholder:text-text-4 focus:border-accent outline-none resize-y leading-relaxed"
                  />
                </div>
              ) : (
                <textarea
                  name={`q_${q.id}`}
                  rows={6}
                  defaultValue={answers[q.id] ?? ""}
                  placeholder="Type your answer here…"
                  className="w-full bg-bg-2 border border-border rounded-lg px-4 py-3 text-[13px] text-text placeholder:text-text-4 focus:border-accent outline-none resize-y leading-relaxed"
                />
              )}
            </div>
          </div>
          );
        })}

        {/* Attachments — PDFs, presentations, supporting docs */}
        <div className="pt-4 border-t border-border mt-2">
          <ReviewAttachments
            responseId={responseId}
            initialAttachments={existingAttachments.map((a) => ({
              id: a.id,
              filename: a.filename,
              mime: a.mime,
              sizeBytes: Number(a.sizeBytes),
              url: `/api/attachments/${a.id}?type=review`,
            }))}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3 pt-2 pb-8 border-t border-border mt-2">
          <button
            type="submit"
            formAction={saveReviewResponse}
            name="action"
            value="save"
            className="btn btn-sm"
          >
            Save Draft
          </button>
          <SubmitButton formAction={saveReviewResponse} />
          <span className="text-[11px] text-text-3 ml-2">
            You can save and come back later. Once submitted, answers are final.
          </span>
        </div>
      </form>
    </div>
  );
}

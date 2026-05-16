"use client";

import { useRef, useState, useTransition } from "react";
import { reviewTask } from "./actions";

interface ReviewActionsProps {
  taskId: string;
}

export function ReviewActions({ taskId }: ReviewActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(verdict: "approve" | "revise") {
    if (!formRef.current) return;
    const feedback = new FormData(formRef.current).get("feedback") as string;
    if (!feedback?.trim()) {
      setError("Please provide feedback before submitting.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("taskId", taskId);
        fd.set("verdict", verdict);
        fd.set("feedback", feedback.trim());
        await reviewTask(fd);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="review-actions-panel">
      <h4 className="review-actions-title">Review Decision</h4>
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <textarea
          name="feedback"
          placeholder="Provide your feedback on this task…"
          className="review-feedback-input"
          rows={3}
          disabled={isPending}
        />
        {error && <p className="review-error">{error}</p>}
        <div className="review-buttons">
          <button
            type="button"
            className="btn-approve"
            disabled={isPending}
            onClick={() => handleSubmit("approve")}
          >
            {isPending ? "…" : "✓ Approve"}
          </button>
          <button
            type="button"
            className="btn-revise"
            disabled={isPending}
            onClick={() => handleSubmit("revise")}
          >
            {isPending ? "…" : "↩ Request Revision"}
          </button>
        </div>
      </form>
    </div>
  );
}

// apps/web/app/quick-capture.tsx
//
// Client-side textarea on My Day. Type → hit Capture (or Cmd/Ctrl+Enter) →
// AI triage + create in one shot. Result chip shows what the model picked,
// with a deep link to the new task.

"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { quickCapture, type QuickCaptureResult } from "./quick-capture-action";

export function QuickCapture() {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<QuickCaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const text = taRef.current?.value.trim() ?? "";
    if (!text) {
      setError("Add a few words.");
      return;
    }
    setError(null);
    start(async () => {
      const r = await quickCapture(text);
      if (!r.ok) {
        setError(r.error ?? "capture failed");
        return;
      }
      setResult(r);
      if (taRef.current) taRef.current.value = "";
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <textarea
        ref={taRef}
        rows={2}
        placeholder="Capture a thought… e.g. 'refund-rate spike on Stock Bee, investigate today'"
        className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
        onKeyDown={onKey}
        disabled={pending}
      />
      <div className="flex items-center justify-between mt-2 gap-3">
        <div className="text-[11px] text-text-3">
          Cmd/Ctrl + Enter to send. Skynet picks project, assignee, priority, due — fall back to defaults if unsure.
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn btn-primary btn-sm gap-1.5"
        >
          {pending ? (
            <>
              <span className="suggest-spinner" aria-hidden="true" />
              Capturing…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Capture
            </>
          )}
        </button>
      </div>

      {error ? <div className="text-danger text-[12px] mt-2">⚠ {error}</div> : null}

      {result?.ok ? (
        <div className="capture-result mt-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="capture-check" aria-hidden="true">✓</span>
            <span className="font-medium text-[13px]">Captured</span>
            <Link href={`/tasks?task=${result.taskId}`} className="ml-auto text-[12px] text-accent-2 hover:underline" scroll={false}>
              View task →
            </Link>
          </div>
          <div className="text-[12px] text-text-2 line-clamp-1 mb-1">{result.title}</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`pchip ${result.projectSlug ?? ""}`}>{result.projectName}</span>
            <span className="text-[11px] text-text-3">→ {result.assigneeName}</span>
            <span className={`prio-chip prio-${result.priority}`}>{result.priority}</span>
            {result.dueDate ? <span className="text-[11px] text-text-3">due {result.dueDate.slice(5)}</span> : null}
          </div>
          {result.reasoning ? <div className="text-[11px] text-text-3 mt-1 italic">{result.reasoning}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

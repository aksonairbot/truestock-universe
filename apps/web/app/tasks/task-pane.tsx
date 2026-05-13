// apps/web/app/tasks/task-pane.tsx
//
// Client component — the Asana-style slide-over shell.
// URL contract: ?task=<uuid> opens the panel; clearing the param closes it.
// Server-rendered panel content is fed in as children; this file owns the
// backdrop, ESC-to-close, focus stealing, and slide-in animation.

"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";

export function TaskPane({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const taskId = params.get("task");

  // ESC closes the panel.
  useEffect(() => {
    if (!taskId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePane();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function closePane() {
    const next = new URLSearchParams(params.toString());
    next.delete("task");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (!taskId) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close task panel"
        className="task-pane-backdrop"
        onClick={closePane}
      />
      <aside className="task-pane" role="dialog" aria-label="Task details">
        <div className="task-pane-head">
          <Link
            href={`/tasks/${taskId}`}
            className="task-pane-fullpage"
            title="Open in full page"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <path d="M14 4h6v6" />
              <path d="M20 4 10 14" />
              <path d="M14 20H6a2 2 0 0 1-2-2V8" />
            </svg>
            Full page
          </Link>
          <button
            type="button"
            onClick={closePane}
            className="task-pane-close"
            aria-label="Close panel"
            title="Close (ESC)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="task-pane-body">{children}</div>
      </aside>
    </>
  );
}

// apps/web/app/projects/[slug]/project-summary-card.tsx
//
// AI-generated health summary card at the top of the project page.

import { getOrGenerateProjectSummary, refreshProjectSummary } from "./project-summary-action";

export async function ProjectSummaryCard({ projectId }: { projectId: string }) {
  const result = await getOrGenerateProjectSummary(projectId);

  if (!result.ok) {
    return (
      <div className="project-summary-card project-summary-error">
        <span className="briefing-label">Project pulse · AI</span>
        <span className="briefing-body">
          Summary unavailable. {result.error ? <span className="text-text-4">({result.error})</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div className="project-summary-card">
      <div className="briefing-head">
        <div className="briefing-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
            <path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8" />
          </svg>
        </div>
        <span className="briefing-label">Project pulse · AI</span>
        <form action={refreshProjectSummary} className="briefing-refresh">
          <input type="hidden" name="projectId" value={projectId} />
          <button type="submit" className="briefing-refresh-btn" title="Regenerate this summary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Refresh
          </button>
        </form>
      </div>
      <div className="briefing-body">{result.body}</div>
      {result.model || result.generatedAt ? (
        <div className="briefing-foot">
          <span>{result.model}</span>
          {result.generatedAt ? (
            <span> · {new Date(result.generatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

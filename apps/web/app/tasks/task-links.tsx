// apps/web/app/tasks/task-links.tsx
//
// Renders a task's external links and the "add link" affordance.
// Design-task Figma files, finished creatives, and the live/published URL of
// a post or ad all live here.

import { addTaskLink, removeTaskLink } from "./link-actions";
import { ActionForm } from "@/components/action-form";

export interface TaskLinkRow {
  id: string;
  kind: string;
  url: string;
  label: string | null;
}

const KIND_META: Record<string, { label: string; color: string }> = {
  figma: { label: "Figma", color: "var(--accent-2)" },
  asset: { label: "Asset", color: "var(--info)" },
  live: { label: "Live", color: "var(--success)" },
  doc: { label: "Doc", color: "var(--warning)" },
  other: { label: "Link", color: "var(--text-3)" },
};

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function TaskLinks({
  taskId,
  links,
  disabled = false,
}: {
  taskId: string;
  links: TaskLinkRow[];
  disabled?: boolean;
}) {
  return (
    <div className="tlinks">
      {links.length > 0 ? (
        <ul className="tlinks-list">
          {links.map((l) => {
            const meta = KIND_META[l.kind] ?? KIND_META.other!;
            return (
              <li key={l.id} className="tlink">
                <span className="tlink-kind" style={{ color: meta.color, borderColor: meta.color }}>
                  {meta.label}
                </span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="tlink-url" title={l.url}>
                  {l.label ?? hostOf(l.url)}
                </a>
                {!disabled ? (
                  <ActionForm action={removeTaskLink} className="tlink-remove-form">
                    <input type="hidden" name="linkId" value={l.id} />
                    <input type="hidden" name="taskId" value={taskId} />
                    <button type="submit" className="tlink-remove" aria-label="Remove link" title="Remove link">
                      ×
                    </button>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!disabled ? (
        <ActionForm action={addTaskLink} className="tlink-add" resetOnSuccess>
          <input type="hidden" name="taskId" value={taskId} />
          <input
            name="url"
            type="text"
            required
            placeholder="Paste a Figma file, creative, or published post URL…"
            className="tlink-input"
          />
          <select name="kind" className="tlink-select" defaultValue="" aria-label="Link type">
            <option value="">Auto</option>
            <option value="figma">Figma</option>
            <option value="asset">Asset</option>
            <option value="live">Live post</option>
            <option value="doc">Doc</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" className="btn btn-ghost btn-sm">Add link</button>
        </ActionForm>
      ) : null}
    </div>
  );
}

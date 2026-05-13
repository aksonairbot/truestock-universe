// apps/web/app/tasks/new-task-form.tsx
//
// Client form for /tasks/new. Features:
//   • AI Suggest button — prefills project/assignee/priority/due
//   • AI clarity check on submit — if task is vague, shows follow-up
//     questions before creating. User can answer or force-create.
//   • Due date mandatory

"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { createTask } from "./actions";
import { suggestTaskMeta, type TriageSuggestion } from "./triage-action";
import { checkTaskClarity } from "./clarity-action";

type Project = { slug: string; name: string };
type User = { id: string; email: string; name: string };

const STATUSES = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];
const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "med", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function dueDateFromOffset(offset: number | null): string {
  if (offset === null) return "";
  return `${offset}d`;
}

export function NewTaskForm({ projects, users, currentUserId }: { projects: Project[]; users: User[]; currentUserId: string }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectSlug, setProjectSlug] = useState(projects.find((p) => p.slug === "skynet-platform")?.slug ?? projects[0]?.slug ?? "");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("med");
  const [dueDate, setDueDate] = useState("");

  const [suggestPending, startSuggest] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [suggestMeta, setSuggestMeta] = useState<{ provider?: string; model?: string; durationMs?: number } | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // Clarity check state
  const [clarityQuestions, setClarityQuestions] = useState<string[]>([]);
  const [clarityAnswers, setClarityAnswers] = useState<string[]>([]);
  const [clarityChecked, setClarityChecked] = useState(false);
  const [checkingClarity, startClarityCheck] = useTransition();

  const formRef = useRef<HTMLFormElement | null>(null);

  function onSuggest() {
    setSuggestError(null);
    setSuggestion(null);
    setSuggestMeta(null);
    if (!title.trim()) {
      setSuggestError("Add a title first.");
      return;
    }
    startSuggest(async () => {
      const r = await suggestTaskMeta({ title, description });
      if (!r.ok || !r.suggestion) {
        setSuggestError(r.error ?? "suggestion failed");
        return;
      }
      const s = r.suggestion;
      setSuggestion(s);
      setSuggestMeta({ provider: r.provider, model: r.model, durationMs: r.durationMs });

      if (s.projectSlug && projects.some((p) => p.slug === s.projectSlug)) {
        setProjectSlug(s.projectSlug);
      }
      if (s.assigneeEmail) {
        const u = users.find((u) => u.email === s.assigneeEmail);
        if (u) setAssigneeId(u.id);
      }
      if (s.priority) setPriority(s.priority);
      if (s.dueOffsetDays !== null) setDueDate(dueDateFromOffset(s.dueOffsetDays));
    });
  }

  function doCreate() {
    if (!formRef.current) return;
    // Append clarity answers to the description before creating
    let finalDesc = description;
    if (clarityQuestions.length > 0 && clarityAnswers.some((a) => a.trim())) {
      const qa = clarityQuestions
        .map((q, i) => `**Q:** ${q}\n**A:** ${clarityAnswers[i]?.trim() || "(not answered)"}`)
        .filter((_, i) => clarityAnswers[i]?.trim())
        .join("\n\n");
      if (qa) {
        finalDesc = finalDesc ? `${finalDesc}\n\n---\n${qa}` : qa;
      }
    }

    const fd = new FormData(formRef.current);
    // Override description with the enriched version
    fd.set("description", finalDesc);

    startSubmit(async () => {
      await createTask(fd);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    // If clarity already checked (user answered questions or bypassed), create directly
    if (clarityChecked) {
      doCreate();
      return;
    }

    // Run clarity check
    startClarityCheck(async () => {
      const r = await checkTaskClarity({ title, description });
      if (r.clear) {
        // Task is clear — create directly
        setClarityChecked(true);
        doCreate();
      } else if (r.questions && r.questions.length > 0) {
        // Task is vague — show questions
        setClarityQuestions(r.questions);
        setClarityAnswers(new Array(r.questions.length).fill(""));
      } else {
        // Fallback — just create
        setClarityChecked(true);
        doCreate();
      }
    });
  }

  function onAnswerChange(idx: number, val: string) {
    setClarityAnswers((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }

  function onSubmitWithAnswers() {
    setClarityChecked(true);
    doCreate();
  }

  function onForceCreate() {
    setClarityChecked(true);
    doCreate();
  }

  function onDismissClarity() {
    setClarityQuestions([]);
    setClarityAnswers([]);
  }

  // Reset clarity state when title/description changes
  function onTitleChange(v: string) {
    setTitle(v);
    if (clarityChecked || clarityQuestions.length > 0) {
      setClarityChecked(false);
      setClarityQuestions([]);
      setClarityAnswers([]);
    }
  }
  function onDescChange(v: string) {
    setDescription(v);
    if (clarityChecked || clarityQuestions.length > 0) {
      setClarityChecked(false);
      setClarityQuestions([]);
      setClarityAnswers([]);
    }
  }

  const showClarityPanel = clarityQuestions.length > 0 && !clarityChecked;

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Title</span>
        <input
          name="title"
          type="text"
          required
          autoFocus
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="What needs to happen?"
          className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
        />
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Description</span>
        <textarea
          name="description"
          rows={4}
          value={description}
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="Context, acceptance criteria, links."
          className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
        ></textarea>
      </label>

      {/* Suggest row */}
      <div className="md:col-span-2 flex items-center justify-between gap-3 pb-1">
        <div className="text-[11px] text-text-3 leading-snug max-w-[60ch]">
          Ask Skynet to pre-fill project, assignee, priority, and due date based on the title + description.
        </div>
        <button
          type="button"
          onClick={onSuggest}
          disabled={suggestPending || !title.trim()}
          className="btn btn-ghost btn-sm gap-1.5"
          title="Triage with the local LLM"
        >
          {suggestPending ? (
            <>
              <span className="suggest-spinner" aria-hidden="true" />
              Thinking…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" aria-hidden="true">
                <path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8" />
              </svg>
              Suggest
            </>
          )}
        </button>
      </div>

      {suggestion ? (
        <div className="md:col-span-2 suggestion-pill" role="status">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12" aria-hidden="true">
              <path d="M5 3v4M3 5h4M14 11l-5 8M19 14v6M16 17h6M12 4v6M9 7h6" />
            </svg>
            <span className="text-[12px] text-text">{suggestion.reasoning || "Suggestion applied."}</span>
            <span className="text-[11px] text-text-3 ml-auto mono">
              {suggestMeta?.model ?? ""}{suggestMeta?.durationMs ? ` · ${Math.round(suggestMeta.durationMs / 100) / 10}s` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {suggestError ? (
        <div className="md:col-span-2 text-[12px] text-danger">⚠ {suggestError}</div>
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Project</span>
        <select
          name="projectSlug"
          required
          value={projectSlug}
          onChange={(e) => setProjectSlug(e.target.value)}
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
        >
          {projects.map((p) => (
            <option key={p.slug} value={p.slug}>{p.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Assignee <span className="text-danger">*</span></span>
        <select
          name="assigneeId"
          required
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Status</span>
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Priority</span>
        <select
          name="priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
        >
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Due in <span className="text-danger">*</span></span>
        <input
          name="dueDate"
          type="text"
          required
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          placeholder="e.g. 3d, 8h, 2d 4h"
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-44"
        />
        <span className="text-[10px] text-text-4">Working hours: Mon–Fri, 9 AM – 6 PM</span>
      </label>

      {/* AI Clarity Questions Panel */}
      {showClarityPanel ? (
        <div className="md:col-span-2 clarity-panel">
          <div className="clarity-panel-header">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>This task could use more detail. Can you clarify?</span>
            <button type="button" onClick={onDismissClarity} className="clarity-dismiss">&times;</button>
          </div>
          <div className="clarity-questions">
            {clarityQuestions.map((q, i) => (
              <div key={i} className="clarity-q">
                <div className="clarity-q-label">{q}</div>
                <input
                  type="text"
                  value={clarityAnswers[i] ?? ""}
                  onChange={(e) => onAnswerChange(i, e.target.value)}
                  placeholder="Your answer..."
                  className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
                />
              </div>
            ))}
          </div>
          <div className="clarity-actions">
            <button type="button" onClick={onSubmitWithAnswers} disabled={submitPending} className="btn btn-primary btn-sm">
              {submitPending ? "Creating…" : "Create with answers"}
            </button>
            <button type="button" onClick={onForceCreate} disabled={submitPending} className="btn btn-ghost btn-sm">
              Skip — create anyway
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3 md:col-span-2 pt-3 border-t border-border">
        <Link href="/tasks" className="btn btn-ghost">Cancel</Link>
        <button
          type="submit"
          disabled={submitPending || checkingClarity}
          className="btn btn-primary disabled:opacity-60"
        >
          {checkingClarity ? (
            <>
              <span className="suggest-spinner" aria-hidden="true" />
              Reviewing…
            </>
          ) : submitPending ? (
            "Creating…"
          ) : (
            "Create task"
          )}
        </button>
      </div>
    </form>
  );
}

// apps/web/app/tasks/new-task-form.tsx
//
// Client form for /tasks/new. Features:
//   • AI Suggest button — prefills project / priority / due (NOT assignee;
//     assignment is a human decision and is gated to admins/managers)
//   • Due date mandatory
//
// The AI clarity check that ran on every submit was removed 2026-07-26 —
// it added 1–15s of LLM latency to every task creation. Suggest remains
// opt-in via the button.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createTask } from "./actions";
import { suggestTaskMeta, type TriageSuggestion } from "./triage-action";
import { AttachmentUpload, type PendingFile } from "./attachment-upload";

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
const RECURRENCES = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Today (+ n days) as YYYY-MM-DD in the user's local clock (team is IST). */
function isoPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextMonday(): string {
  const day = new Date().getDay(); // 0=Sun..6=Sat
  const add = ((8 - day) % 7) || 7;
  return isoPlus(add);
}

function dueDateFromOffset(offset: number | null): string {
  if (offset === null) return "";
  // Server caps due dates at ~2 weeks — clamp AI suggestions so an
  // enthusiastic "30d" suggestion can't make the eventual submit fail.
  return isoPlus(Math.min(Math.max(offset, 0), 14));
}

const DUE_CHIPS: Array<{ label: string; value: () => string }> = [
  { label: "Today", value: () => isoPlus(0) },
  { label: "Tomorrow", value: () => isoPlus(1) },
  { label: "+3 days", value: () => isoPlus(3) },
  { label: "Next Mon", value: () => nextMonday() },
  { label: "+2 weeks", value: () => isoPlus(14) },
];

export function NewTaskForm({ projects, users, currentUserId, userRole }: { projects: Project[]; users: User[]; currentUserId: string; userRole: string }) {
  const router = useRouter();
  // Members can only assign tasks to themselves
  const canAssignOthers = userRole === "admin" || userRole === "manager";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectSlug, setProjectSlug] = useState(projects.find((p) => p.slug === "skynet-platform")?.slug ?? projects[0]?.slug ?? "");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("med");
  const [recurrence, setRecurrence] = useState("none");
  const [dueDate, setDueDate] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const [suggestPending, startSuggest] = useTransition();
  const [submitPending, startSubmit] = useTransition();
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);
  const [suggestMeta, setSuggestMeta] = useState<{ provider?: string; model?: string; durationMs?: number } | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // AI no longer suggests assignees — assignment is a human decision and is
  // gated to admins/managers anyway. (See triage-action.ts.)

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
      // Assignee suggestion intentionally not applied — AI does not pick
      // assignees in this build.
      if (s.priority) setPriority(s.priority);
      if (s.dueOffsetDays !== null) setDueDate(dueDateFromOffset(s.dueOffsetDays));
    });
  }

  function doCreate() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);

    startSubmit(async () => {
      // Catch validation throws (bad due-date syntax, >10 working days, missing
      // fields) and show them inline — an uncaught rejection here escalated to
      // the root error boundary and destroyed everything the user had typed.
      setSubmitError(null);
      let taskId: string;
      try {
        taskId = await createTask(fd);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Could not create the task. Please check the fields and try again.");
        return;
      }

      // Upload pending attachments if any
      if (pendingFiles.length > 0) {
        const uploadFd = new FormData();
        pendingFiles.forEach((p) => uploadFd.append("files", p.file));
        try {
          await fetch(`/api/tasks/${taskId}/attachments`, {
            method: "POST",
            body: uploadFd,
          });
        } catch {
          // Non-blocking — task is created; files just didn't attach
        }
      }

      router.push("/tasks");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    doCreate();
  }

  function onTitleChange(v: string) {
    setTitle(v);
  }
  function onDescChange(v: string) {
    setDescription(v);
  }

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
          Ask SeekPeak to pre-fill project, priority, and due date based on the title + description. You pick the assignee.
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
        {canAssignOthers ? (
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
        ) : (
          <>
            <input type="hidden" name="assigneeId" value={currentUserId} />
            <div className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] text-text-2">
              {users.find((u) => u.id === currentUserId)?.name ?? "You"}
            </div>
          </>
        )}
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
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Repeats</span>
        <select
          name="recurrence"
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value)}
          className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-44"
        >
          {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span className="text-[10px] text-text-4">
          {recurrence === "none"
            ? "One-time task."
            : `A new copy spawns automatically when this is marked Done.`}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 md:col-span-2">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Due date <span className="text-danger">*</span></span>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            name="dueDate"
            type="date"
            required
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            min={isoPlus(0)}
            max={isoPlus(14)}
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-44"
          />
          {DUE_CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setDueDate(c.value())}
              className={`btn btn-ghost btn-sm ${dueDate === c.value() ? "text-accent-2" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-text-4">Pick a date or tap a preset · up to 2 weeks out</span>
      </label>

      {/* Attachments */}
      <div className="md:col-span-2">
        <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium block mb-1.5">
          Attachments <span className="normal-case text-text-4">(optional, max 3)</span>
        </span>
        <AttachmentUpload
          pendingFiles={pendingFiles}
          onPendingChange={setPendingFiles}
        />
      </div>

      {submitError ? (
        <div className="md:col-span-2 text-[12px] text-danger" role="alert">⚠ {submitError}</div>
      ) : null}

      <div className="flex items-center justify-end gap-3 md:col-span-2 pt-3 border-t border-border">
        <Link href="/tasks" className="btn btn-ghost">Cancel</Link>
        <button
          type="submit"
          disabled={submitPending}
          className="btn btn-primary disabled:opacity-60"
        >
          {submitPending ? "Creating…" : "Create task"}
        </button>
      </div>
    </form>
  );
}

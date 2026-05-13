// apps/web/app/tasks/subtask-list.tsx
//
// Client subtask checklist rendered inside the slide-over. Each row is its
// own optimistic check; new subtasks append below the list via a small inline
// form with assignee selection. Submitting either commits the action and
// revalidates.

"use client";

import { useOptimistic, useRef, useState, useTransition, useEffect } from "react";
import { updateTaskStatus, addSubtask, assignTask } from "./actions";
import { breakDownTask } from "./breakdown-action";

type Subtask = {
  id: string;
  title: string;
  status: string;
  assigneeName: string | null;
  assigneeId: string | null;
  pending?: boolean;
};

type UserOption = { id: string; name: string };

function isDone(s: string) {
  return s === "done";
}

function SubtaskRow({ s, users }: { s: Subtask; users: UserOption[] }) {
  const [done, setDone] = useState(isDone(s.status));
  const [pending, start] = useTransition();
  const [assignPending, assignStart] = useTransition();

  function toggle() {
    const next = !done;
    setDone(next);
    const fd = new FormData();
    fd.set("taskId", s.id);
    fd.set("status", next ? "done" : "todo");
    start(async () => {
      try {
        await updateTaskStatus(fd);
      } catch {
        setDone(!next);
      }
    });
  }

  function onAssigneeChange(userId: string) {
    const fd = new FormData();
    fd.set("taskId", s.id);
    fd.set("assigneeId", userId);
    assignStart(async () => {
      await assignTask(fd);
    });
  }

  return (
    <li className={`subtask-row ${done ? "is-done" : ""} ${pending ? "is-pending" : ""} ${s.pending ? "is-fresh" : ""}`}>
      <button
        type="button"
        onClick={toggle}
        className={`acheck ${done ? "is-done" : ""}`}
        aria-label={done ? "Mark subtask as to do" : "Mark subtask as done"}
        aria-pressed={done}
      >
        {done ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="11" height="11">
            <path d="m5 12 5 5L20 7" />
          </svg>
        ) : null}
      </button>
      <span className="subtask-title">{s.title}</span>
      <select
        className="subtask-assignee-select"
        value={s.assigneeId ?? ""}
        onChange={(e) => onAssigneeChange(e.target.value)}
        disabled={assignPending}
        title="Assign subtask"
      >
        <option value="">—</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </li>
  );
}

export function SubtaskList({
  parentId,
  initialSubtasks,
  users,
}: {
  parentId: string;
  initialSubtasks: Subtask[];
  users: UserOption[];
}) {
  // Sync state with server data when initialSubtasks changes after revalidation
  const [list, setList] = useState<Subtask[]>(initialSubtasks);
  useEffect(() => {
    setList(initialSubtasks);
  }, [initialSubtasks]);

  const [optimistic, addOptimistic] = useOptimistic<Subtask[], Subtask>(list, (state, s) => [...state, s]);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [bdPending, bdStart] = useTransition();
  const [bdError, setBdError] = useState<string | null>(null);
  const [bdSuggestions, setBdSuggestions] = useState<string[] | null>(null);
  const [bdReasoning, setBdReasoning] = useState<string | null>(null);
  const [bdSelected, setBdSelected] = useState<Record<string, boolean>>({});

  function runBreakdown() {
    setBdError(null);
    setBdSuggestions(null);
    setBdReasoning(null);
    bdStart(async () => {
      const r = await breakDownTask(parentId);
      if (!r.ok || !r.subtasks) { setBdError(r.error ?? "couldn't generate"); return; }
      setBdSuggestions(r.subtasks);
      setBdReasoning(r.reasoning ?? null);
      // Pre-select all suggestions.
      const init: Record<string, boolean> = {};
      r.subtasks.forEach((s) => { init[s] = true; });
      setBdSelected(init);
    });
  }

  function acceptBreakdown() {
    if (!bdSuggestions) return;
    const titlesToAdd = bdSuggestions.filter((s) => bdSelected[s]);
    if (titlesToAdd.length === 0) { setBdSuggestions(null); return; }
    bdStart(async () => {
      for (const title of titlesToAdd) {
        const fd = new FormData();
        fd.set("parentId", parentId);
        fd.set("title", title);
        const tmpId = `tmp-bd-${Date.now()}-${Math.random()}`;
        const optimisticItem: Subtask = {
          id: tmpId, title, status: "todo", assigneeName: null, assigneeId: null, pending: true,
        };
        addOptimistic(optimisticItem);
        setList((prev) => [...prev, { ...optimisticItem, pending: false }]);
        try { await addSubtask(fd); } catch { setList((prev) => prev.filter((x) => x.id !== tmpId)); }
      }
      setBdSuggestions(null);
      setBdSelected({});
      setBdReasoning(null);
    });
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = inputRef.current?.value.trim() ?? "";
    if (!title) return;

    const assigneeName = selectedAssignee
      ? users.find((u) => u.id === selectedAssignee)?.name ?? null
      : null;

    const tmpId = `tmp-${Date.now()}`;
    const optimisticItem: Subtask = {
      id: tmpId,
      title,
      status: "todo",
      assigneeName,
      assigneeId: selectedAssignee || null,
      pending: true,
    };
    const fd = new FormData();
    fd.set("parentId", parentId);
    fd.set("title", title);
    if (selectedAssignee) fd.set("assigneeId", selectedAssignee);

    start(async () => {
      addOptimistic(optimisticItem);
      setList((prev) => [...prev, { ...optimisticItem, pending: false }]);
      if (inputRef.current) inputRef.current.value = "";
      setSelectedAssignee("");
      try {
        await addSubtask(fd);
      } catch {
        setList((prev) => prev.filter((x) => x.id !== tmpId));
      }
    });
  }

  const view = optimistic;
  const total = view.length;
  const done = view.filter((s) => isDone(s.status)).length;

  return (
    <div className="subtasks">
      <div className="subtasks-head">
        <span className="task-pane-section-h" style={{ margin: 0 }}>
          Subtasks{total > 0 ? <span className="text-text-3 font-normal"> · {done}/{total} done</span> : null}
        </span>
        {total > 0 ? (
          <div className="subtask-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <div className="subtask-progress-fill" style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={runBreakdown}
          disabled={bdPending}
          className="break-down-btn"
          title="Ask Skynet to suggest subtasks"
        >
          {bdPending && !bdSuggestions ? (
            <>
              <span className="suggest-spinner" aria-hidden="true" />
              Breaking down…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12" aria-hidden="true">
                <path d="M5 3v4M3 5h4M12 4v6M9 7h6M19 14v6M16 17h6M14 11l-5 8" />
              </svg>
              Break it down
            </>
          )}
        </button>
      </div>
      {bdError ? <div className="text-danger text-[11.5px] mb-2">⚠ {bdError}</div> : null}
      {bdSuggestions ? (
        <div className="breakdown-panel">
          <div className="breakdown-h">Suggested subtasks <span className="text-text-3 font-normal">· tick to keep, untick to drop</span></div>
          <ul className="breakdown-list">
            {bdSuggestions.map((s) => (
              <li key={s} className="breakdown-row">
                <input
                  type="checkbox"
                  checked={!!bdSelected[s]}
                  onChange={(e) => setBdSelected((prev) => ({ ...prev, [s]: e.target.checked }))}
                />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          {bdReasoning ? <div className="breakdown-reasoning">{bdReasoning}</div> : null}
          <div className="breakdown-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBdSuggestions(null)} disabled={bdPending}>
              Discard
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={acceptBreakdown} disabled={bdPending}>
              {bdPending ? "Adding…" : `Add ${bdSuggestions.filter((s) => bdSelected[s]).length}`}
            </button>
          </div>
        </div>
      ) : null}
      {total === 0 && !adding ? (
        <button type="button" className="subtask-empty-add" onClick={() => { setAdding(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add a subtask
        </button>
      ) : (
        <>
          <ul className="subtask-list">
            {view.map((s) => <SubtaskRow key={s.id} s={s} users={users} />)}
          </ul>
          <form onSubmit={onAdd} className="subtask-add-row">
            <button type="submit" className="acheck" aria-label="Add subtask" tabIndex={-1} disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type="text"
              placeholder={pending ? "Adding…" : "Add a subtask…"}
              className="subtask-add-input"
              autoComplete="off"
              maxLength={250}
              disabled={pending}
            />
            <select
              className="subtask-assignee-select"
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              disabled={pending}
              title="Assign to"
            >
              <option value="">Assign to…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </form>
        </>
      )}
    </div>
  );
}

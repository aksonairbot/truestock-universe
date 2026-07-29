// apps/web/components/command-palette.tsx
//
// ⌘K command palette — keyboard-first navigation (Linear-style).
// Also makes the sidebar's long-advertised "G T" / "G U" hints REAL:
//   g t → Tasks, g p → Projects, g h → Today, g i → Inbox, g u → Members,
//   g w → My week, and a bare "n" → New task.
// Sequences only fire outside inputs/textareas/selects, never with modifiers.

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Cmd = { id: string; label: string; hint?: string; keywords?: string; href: string };

export function CommandPalette({ isPrivileged = false }: { isPrivileged?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastG = useRef(0);

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: "new-task", label: "New task", hint: "N", href: "/tasks/new", keywords: "create add capture" },
      { id: "tasks", label: "Go to Tasks", hint: "G T", href: "/tasks", keywords: "list" },
      { id: "board", label: "Go to Board", href: "/tasks?view=board", keywords: "kanban columns" },
      { id: "today", label: "Go to Today", hint: "G H", href: "/", keywords: "home dashboard" },
      { id: "projects", label: "Go to Projects", hint: "G P", href: "/projects" },
      { id: "content", label: "Go to Content calendar", hint: "G C", href: "/content", keywords: "social post publish schedule campaign" },
      { id: "content-board", label: "Go to Content pipeline board", href: "/content?view=board", keywords: "social pipeline stage kanban idea script design" },
      { id: "week", label: "Go to My week", hint: "G W", href: "/me/week" },
      { id: "month", label: "Go to Month", href: "/me/month" },
      { id: "chat", label: "Go to Chat", href: "/chat", keywords: "messages" },
      { id: "inbox", label: "Go to Inbox", hint: "G I", href: "/notifications", keywords: "notifications" },
      { id: "settings", label: "Go to Settings", href: "/settings" },
    ];
    if (isPrivileged) {
      base.push(
        { id: "members", label: "Go to Members", hint: "G U", href: "/members", keywords: "team people users" },
        { id: "team", label: "Go to Team", href: "/team/week" },
      );
    }
    return base;
  }, [isPrivileged]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(s));
  }, [q, commands]);

  const items = useMemo<Cmd[]>(() => {
    const s = q.trim();
    if (!s) return filtered;
    return [
      ...filtered,
      { id: "search", label: `Search tasks for "${s}"`, hint: "↵", href: `/tasks?q=${encodeURIComponent(s)}` },
    ];
  }, [filtered, q]);

  const go = useCallback((href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  }, [router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        (t && t.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setIdx(0);
        return;
      }
      if (open || typing || e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const now = Date.now();
      if (key === "g") {
        lastG.current = now;
        return;
      }
      if (now - lastG.current < 900) {
        const map: Record<string, string> = {
          t: "/tasks", p: "/projects", h: "/", i: "/notifications", u: "/members", w: "/me/week", c: "/content",
        };
        const href = map[key];
        lastG.current = 0;
        if (href) {
          e.preventDefault();
          router.push(href);
          return;
        }
      }
      if (key === "n") {
        e.preventDefault();
        router.push("/tasks/new");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, router]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    setIdx(0);
  }, [q]);

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
      <div className="cmdk" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Type a command or search tasks…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && items[idx]) go(items[idx]!.href);
          }}
        />
        <div className="cmdk-list">
          {items.length === 0 ? (
            <div className="cmdk-empty">No matches</div>
          ) : (
            items.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={`cmdk-item ${i === idx ? "active" : ""}`}
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(c.href)}
              >
                <span>{c.label}</span>
                {c.hint ? <span className="cmdk-hint">{c.hint}</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
          <span style={{ marginLeft: "auto" }}>⌘K anywhere</span>
        </div>
      </div>
    </div>
  );
}

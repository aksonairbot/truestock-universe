// apps/web/app/tasks/task-row-title.tsx
//
// Opening a task changes a search param on the SAME route, so Next re-renders
// the whole /tasks page on the server before it will commit the URL or paint
// anything (~1.3s from India to the droplet). With a plain <Link> that reads
// as "clicking does nothing" — users click two or three times and conclude the
// app is broken.
//
// useTransition gives us the pending state of that navigation, so the row can
// respond on the very first click: title dims, a spinner appears, and the row
// is marked busy. The content still takes the same time to arrive — it just
// stops feeling broken while it does.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function TaskRowTitle({ href, title }: { href: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <a
      href={href}
      className={`atitle ${pending ? "is-opening" : ""}`}
      aria-busy={pending || undefined}
      onClick={(e) => {
        // Let modified clicks (new tab / new window) behave natively.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        start(() => router.push(href, { scroll: false }));
      }}
    >
      {title}
      {pending ? <span className="atitle-spin" aria-hidden="true" /> : null}
    </a>
  );
}

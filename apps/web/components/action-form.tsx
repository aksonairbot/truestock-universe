// apps/web/components/action-form.tsx
//
// A form that shows its server action's error instead of losing it.
//
// Next.js redacts thrown server-action messages in production, so
// `<form action={serverAction}>` turns every validation failure into a
// full-page "Something went wrong". This calls the action directly, reads the
// returned {ok,error}, and renders the message where the person is looking.
//
// It is a CLIENT component that SERVER components can render — passing a
// server action across that boundary is exactly what the boundary is for. So
// task-detail, the composer, the publish panel and the rest stay server
// components and still get real error handling.
//
// The children are rendered as DIRECT children of the <form>, with no wrapper
// element. That matters: nearly every call site's form is itself the flex or
// grid container for its fields, and an extra div would collapse the layout.
// The first draft wrapped them in `display: contents` to dodge exactly that —
// which quietly broke the in-flight dimming, because an element with
// `display: contents` generates no box and therefore ignores opacity and
// pointer-events. The state now lives on the form, which is a real box.

"use client";

import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

export function ActionForm({
  action,
  className,
  children,
  resetOnSuccess = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  className?: string;
  children: React.ReactNode;
  resetOnSuccess?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      try {
        const res = await action(fd);
        if (res?.ok) {
          if (resetOnSuccess) ref.current?.reset();
        } else {
          setError(res?.error ?? "That didn't work.");
        }
      } catch {
        // Only genuine faults reach here — and their message is redacted
        // anyway, so say something honest rather than something specific.
        setError("Something went wrong on the server. The details are in the log.");
      }
    });
  }

  return (
    <form
      ref={ref}
      onSubmit={onSubmit}
      className={className ? `act-form ${className}` : "act-form"}
      data-pending={pending ? "true" : undefined}
    >
      {children}
      {error ? (
        <div className="act-error" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}

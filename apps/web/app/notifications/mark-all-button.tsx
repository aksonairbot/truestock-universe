// apps/web/app/notifications/mark-all-button.tsx
//
// "Mark all read" as a client control so the click actually LOOKS like it
// did something: the button disables, a toast confirms, the sidebar badge
// refreshes, and the list re-renders. The old server-action form wrote to
// the DB correctly but left every row visually unread, so it read as broken.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllRead } from "./actions";
import { useToast } from "@/components/toaster";
import { BADGE_REFRESH_EVENT } from "@/lib/badge-events";

export function MarkAllReadButton({ unread }: { unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        start(async () => {
          try {
            await markAllRead();
            window.dispatchEvent(new Event(BADGE_REFRESH_EVENT));
            router.refresh();
            toast(unread === 1 ? "1 notification marked read" : `${unread} notifications marked read`);
          } catch {
            toast("Couldn't mark them read — try again.", { tone: "error" });
          }
        });
      }}
    >
      {pending ? "Marking…" : "Mark all read"}
    </button>
  );
}

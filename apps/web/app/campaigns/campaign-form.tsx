// apps/web/app/campaigns/campaign-form.tsx
//
// Create a campaign. Collapsed to a single button until it's wanted — the
// campaign list is read far more often than it's added to, and a permanently
// open six-field form makes the page look like an admin console instead of a
// plan.
//
// The submit does NOT use `action={createCampaign}`. Next.js redacts thrown
// server-action messages in production, so a rejected budget or a missing name
// showed up as a full-page "Something went wrong" — see the note atop
// campaign-actions.ts. The action returns {ok,error} and we render it here,
// next to the field the person needs to fix.

"use client";

import { useRef, useState, useTransition } from "react";
import { createCampaign } from "./campaign-actions";
import { CAMPAIGN_STATUSES, istToday } from "@/lib/campaigns";

export function CampaignForm({
  owners,
  defaultOwnerId,
}: {
  owners: Array<{ id: string; name: string }>;
  defaultOwnerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      try {
        const res = await createCampaign(fd);
        if (res.ok) {
          formRef.current?.reset();
          setOpen(false);
        } else {
          setError(res.error);
        }
      } catch {
        // Only real faults reach here now; the message would be redacted
        // anyway, so say something honest rather than something specific.
        setError("Couldn't save that campaign. Check the server log.");
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New campaign
      </button>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card cmp-form motion-in">
      <div className="cmp-form-grid">
        <label className="cmp-field cmp-field-wide">
          <span className="cmp-label">Name</span>
          <input
            name="name"
            type="text"
            required
            autoFocus
            maxLength={200}
            placeholder="Diwali push, StockBee launch, Q3 webinars…"
            className="cmp-input"
          />
        </label>

        <label className="cmp-field cmp-field-wide">
          <span className="cmp-label">Objective</span>
          <input
            name="objective"
            type="text"
            maxLength={2000}
            placeholder="What is this campaign for? One line is enough."
            className="cmp-input"
          />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Status</span>
          <select name="status" defaultValue="planning" className="cmp-input">
            {CAMPAIGN_STATUSES.filter((s) => s.value !== "cancelled").map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Owner</span>
          <select name="ownerId" defaultValue={defaultOwnerId} className="cmp-input">
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Starts</span>
          <input name="startDate" type="date" defaultValue={istToday()} className="cmp-input" />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Ends</span>
          <input name="endDate" type="date" className="cmp-input" />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Budget</span>
          {/* Type it the way you say it — 50000, 50,000, 1.5L, 2Cr all parse. */}
          <input name="budget" type="text" inputMode="decimal" placeholder="e.g. 2L" className="cmp-input" />
        </label>
      </div>

      {error ? <div className="cmp-error" role="alert">{error}</div> : null}

      <div className="cmp-form-foot">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Creating…" : "Create campaign"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// apps/web/app/campaigns/[id]/cadence-form.tsx
//
// "Three reels a week for six weeks." Creating eighteen near-identical tasks
// by hand is the single biggest reason a marketing team abandons the tool and
// goes back to a spreadsheet, so this generates the whole run at once.
//
// Collapsed behind a button: planning a cadence is something you do at the
// start of a campaign, not every time you open the page.

"use client";

import { useState } from "react";
import { planCadence } from "../campaign-actions";
import { CONTENT_CHANNELS } from "@/lib/content";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export function CadenceForm({
  campaignId,
  startDate,
  endDate,
  projects,
  users,
}: {
  campaignId: string;
  /** Defaults to the campaign window — the usual answer. */
  startDate: string | null;
  endDate: string | null;
  projects: Array<{ slug: string; name: string }>;
  users: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([2, 4]);

  function toggle(d: number) {
    setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Plan a cadence
      </button>
    );
  }

  return (
    <form action={planCadence} className="card cmp-form mt-4">
      <input type="hidden" name="campaignId" value={campaignId} />

      <div className="cmp-form-head">
        <strong>Plan a cadence</strong>
        <span className="cmp-form-hint">
          Every slot is created as an <em>idea</em> — nothing is approved or scheduled to go out.
        </span>
      </div>

      <div className="cmp-form-grid">
        <label className="cmp-field">
          <span className="cmp-label">Channel</span>
          <select name="channel" defaultValue="instagram" className="cmp-input" required>
            {CONTENT_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Title</span>
          <input
            name="titlePrefix"
            type="text"
            required
            maxLength={120}
            placeholder="Reel, Market recap…"
            className="cmp-input"
          />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Project</span>
          <select name="projectSlug" className="cmp-input" required>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Assign to</span>
          <select name="assigneeId" className="cmp-input">
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>

        <label className="cmp-field">
          <span className="cmp-label">From</span>
          <input name="startDate" type="date" defaultValue={startDate ?? ""} required className="cmp-input" />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Until</span>
          <input name="endDate" type="date" defaultValue={endDate ?? ""} required className="cmp-input" />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Time (IST)</span>
          <input name="time" type="time" defaultValue="10:00" className="cmp-input" />
        </label>

        <label className="cmp-field">
          <span className="cmp-label">Budget each</span>
          <input name="budget" type="text" inputMode="decimal" placeholder="optional" className="cmp-input" />
        </label>
      </div>

      <div className="cmp-days">
        <span className="cmp-label">Days</span>
        <div className="cmp-days-row">
          {DAYS.map((d) => (
            <label key={d.value} className={`cmp-day ${picked.includes(d.value) ? "is-on" : ""}`}>
              <input
                type="checkbox"
                name="days"
                value={d.value}
                checked={picked.includes(d.value)}
                onChange={() => toggle(d.value)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="cmp-form-foot">
        <button type="submit" className="btn btn-primary btn-sm">Create the slots</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        <span className="cmp-form-hint">
          Re-running skips slots that already exist, so extending a run is safe.
        </span>
      </div>
    </form>
  );
}

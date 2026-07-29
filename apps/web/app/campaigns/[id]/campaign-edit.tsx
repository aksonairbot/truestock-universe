// apps/web/app/campaigns/[id]/campaign-edit.tsx
//
// Edit / archive the campaign. Collapsed by default and placed at the BOTTOM
// of the plan on purpose: the plan is what people come here to read, and
// settings shouldn't sit above it competing for attention.

"use client";

import { useState } from "react";
import { updateCampaign, archiveCampaign } from "../campaign-actions";
import { CAMPAIGN_STATUSES } from "@/lib/campaigns";

export function CampaignEdit({
  campaignId,
  name,
  objective,
  status,
  startDate,
  endDate,
  budget,
  ownerId,
  owners,
  archived,
}: {
  campaignId: string;
  name: string;
  objective: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  /** Plain rupees, already formatted for an input. */
  budget: string;
  ownerId: string | null;
  owners: Array<{ id: string; name: string }>;
  archived: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="cmp-edit-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Campaign settings
        </button>
        {archived ? <span className="cmp-archived">archived</span> : null}
      </div>
    );
  }

  return (
    <div className="card cmp-form mt-6">
      <form action={updateCampaign}>
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="cmp-form-grid">
          <label className="cmp-field cmp-field-wide">
            <span className="cmp-label">Name</span>
            <input name="name" type="text" required defaultValue={name} maxLength={200} className="cmp-input" />
          </label>

          <label className="cmp-field cmp-field-wide">
            <span className="cmp-label">Objective</span>
            <input
              name="objective"
              type="text"
              defaultValue={objective ?? ""}
              maxLength={2000}
              className="cmp-input"
            />
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Status</span>
            <select name="status" defaultValue={status} className="cmp-input">
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Owner</span>
            <select name="ownerId" defaultValue={ownerId ?? ""} className="cmp-input">
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Starts</span>
            <input name="startDate" type="date" defaultValue={startDate ?? ""} className="cmp-input" />
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Ends</span>
            <input name="endDate" type="date" defaultValue={endDate ?? ""} className="cmp-input" />
          </label>

          <label className="cmp-field">
            <span className="cmp-label">Budget</span>
            <input
              name="budget"
              type="text"
              inputMode="decimal"
              defaultValue={budget}
              placeholder="e.g. 2L"
              className="cmp-input"
            />
          </label>
        </div>

        <div className="cmp-form-foot">
          <button type="submit" className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Close</button>
        </div>
      </form>

      {/* Archive, never delete — a finished campaign is the record of what a
          quarter was spent on, and its tasks would lose the only trace of why
          they existed. */}
      <form action={archiveCampaign} className="cmp-danger">
        <input type="hidden" name="campaignId" value={campaignId} />
        <input type="hidden" name="restore" value={archived ? "true" : "false"} />
        <button type="submit" className="btn btn-ghost btn-sm">
          {archived ? "Restore campaign" : "Archive campaign"}
        </button>
        <span className="cmp-danger-note">
          {archived
            ? "Archived campaigns stay readable and keep all their items."
            : "Archiving hides it from the list. Nothing is deleted and its tasks are untouched."}
        </span>
      </form>
    </div>
  );
}

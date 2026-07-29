// apps/web/app/tasks/campaign-fields.tsx
//
// Which push does this work belong to, and what does it cost?
//
// Shown on EVERY task, not only content: a campaign contains the ads and the
// posts, but also "brief the designer" and "book the webinar platform". If
// only content could be filed under a campaign, the plan would be missing
// half the work it depends on.

import { setTaskCampaign } from "../campaigns/campaign-actions";
import { CAMPAIGN_STATUS_COLOR } from "@/lib/campaigns";

export function CampaignFields({
  taskId,
  campaignId,
  budget,
  campaigns,
  disabled = false,
}: {
  taskId: string;
  campaignId: string | null;
  /** Plain rupees for the input, e.g. "50000". */
  budget: string;
  campaigns: Array<{ id: string; name: string; status: string }>;
  disabled?: boolean;
}) {
  const current = campaigns.find((c) => c.id === campaignId);

  // Nothing to file under yet — say so rather than showing an empty select.
  if (campaigns.length === 0 && !campaignId) {
    return (
      <div className="cfield-empty">
        No campaigns yet. An admin or manager can create one under Campaigns.
      </div>
    );
  }

  return (
    <form action={setTaskCampaign} className="content-fields is-content">
      <input type="hidden" name="taskId" value={taskId} />
      <div className="content-fields-row">
        <label className="content-field">
          <span className="content-field-label">Campaign</span>
          <select
            name="campaignId"
            defaultValue={campaignId ?? ""}
            disabled={disabled}
            className="content-select"
            style={
              current
                ? { color: CAMPAIGN_STATUS_COLOR[current.status], borderColor: CAMPAIGN_STATUS_COLOR[current.status] }
                : undefined
            }
          >
            <option value="">Not in a campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="content-field">
          <span className="content-field-label">Budget</span>
          {/* Typed the way people say it — 50000, 50,000, 1.5L, 2Cr. */}
          <input
            type="text"
            name="budget"
            inputMode="decimal"
            defaultValue={budget}
            placeholder="e.g. 25000"
            disabled={disabled}
            className="content-input"
          />
        </label>

        {!disabled ? (
          <button type="submit" className="btn btn-ghost btn-sm content-save">Update</button>
        ) : null}
      </div>
    </form>
  );
}

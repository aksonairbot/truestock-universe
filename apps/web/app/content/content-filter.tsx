// apps/web/app/content/content-filter.tsx
//
// Narrow the calendar or the board to one campaign.
//
// Deliberately tiny: a marketing lead planning the Diwali push wants the
// calendar to show the Diwali push, not everything the company is doing that
// month. Hides itself entirely when there are no campaigns, so teams that
// don't run them never see a dead control.

"use client";

import { useRouter } from "next/navigation";

export function ContentFilter({
  campaign,
  campaigns,
  view,
  month,
}: {
  campaign: string;
  campaigns: Array<{ id: string; name: string }>;
  view?: string;
  month?: string;
}) {
  const router = useRouter();
  if (campaigns.length === 0) return null;

  function go(next: string) {
    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (month) params.set("month", month);
    if (next) params.set("campaign", next);
    const qs = params.toString();
    router.push(qs ? `/content?${qs}` : "/content");
  }

  return (
    <select
      aria-label="Filter by campaign"
      className={`filter-select ${campaign ? "on" : ""}`}
      value={campaign}
      onChange={(e) => go(e.target.value)}
    >
      <option value="">Campaign: all</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}

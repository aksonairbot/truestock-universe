// apps/web/app/campaigns/page.tsx
//
// The campaign list — every push the team is running, with the two numbers a
// media plan lives or dies on: how much of the budget is allocated, and how
// much of the work is actually out the door.
//
// Campaigns are visible to everyone (planning is shared context; you can't
// plan around work you can't see). Creating and editing is admin/manager.
// Individual TASKS inside a campaign still obey the normal data wall on the
// plan page.

import Link from "next/link";
import { getDb, campaigns, tasks, users, eq, and, sql, asc, isNull } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isPrivileged } from "@/lib/access";
import { CAMPAIGN_STATUS_COLOR, CAMPAIGN_STATUS_LABEL, istToday } from "@/lib/campaigns";
import { formatInrFromPaise } from "@/lib/format";
import { CampaignForm } from "./campaign-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campaigns · SeekPeak",
  description: "Digital media plans and campaigns",
};

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return "No dates set";
  const f = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  if (start && end) return `${f(start)} → ${f(end)}`;
  return start ? `from ${f(start)}` : `until ${f(end!)}`;
}

interface PageProps {
  searchParams: Promise<{ archived?: string }>;
}

export default async function CampaignsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const me = await getCurrentUser();
  const canPlan = isPrivileged(me);
  const db = getDb();
  const today = istToday();

  const [rows, statRows, owners] = await Promise.all([
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        objective: campaigns.objective,
        status: campaigns.status,
        startDate: campaigns.startDate,
        endDate: campaigns.endDate,
        budgetPaise: campaigns.budgetPaise,
        archivedAt: campaigns.archivedAt,
        ownerName: users.name,
      })
      .from(campaigns)
      .leftJoin(users, eq(campaigns.ownerId, users.id))
      .where(showArchived ? sql`1=1` : isNull(campaigns.archivedAt))
      .orderBy(asc(campaigns.startDate), asc(campaigns.name)),

    // One grouped pass over tasks instead of a query per campaign.
    db
      .select({
        campaignId: tasks.campaignId,
        items: sql<number>`count(*)::int`,
        allocated: sql<string>`coalesce(sum(${tasks.budgetPaise}), 0)::text`,
        open: sql<number>`count(*) filter (where ${tasks.status} not in ('done'::task_status, 'cancelled'::task_status))::int`,
        live: sql<number>`count(*) filter (where ${tasks.publishState} = 'published')::int`,
      })
      .from(tasks)
      .where(sql`${tasks.campaignId} is not null`)
      .groupBy(tasks.campaignId),

    canPlan
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(and(eq(users.isActive, true), sql`${users.role} <> 'agent'::user_role`))
          .orderBy(asc(users.name))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  const statsById = new Map(statRows.map((s) => [s.campaignId, s]));

  const active = rows.filter((r) => !r.archivedAt);
  const archivedCount = rows.length - active.length;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Campaigns</div>
          <div className="page-sub">
            {active.length} {active.length === 1 ? "campaign" : "campaigns"}
            {showArchived && archivedCount > 0 ? ` · ${archivedCount} archived` : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={showArchived ? "/campaigns" : "/campaigns?archived=1"} className="btn btn-ghost btn-sm">
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        </div>
      </div>

      {canPlan ? <CampaignForm owners={owners} defaultOwnerId={me.id} /> : null}

      {rows.length === 0 ? (
        <div className="card text-center py-16 mt-4">
          <div className="text-text-2 mb-2">No campaigns yet.</div>
          <div className="text-text-3 text-[12px]">
            A campaign is a push — a launch, a festival, a webinar series. Give it a window and a budget,
            then file the posts, ads and emails under it.
          </div>
        </div>
      ) : (
        <div className="cmp-grid mt-4">
          {rows.map((c) => {
            const s = statsById.get(c.id);
            const allocated = BigInt(s?.allocated ?? "0");
            const budget = c.budgetPaise ?? 0n;
            const pct = budget > 0n ? Math.min(100, Number((allocated * 100n) / budget)) : 0;
            const over = budget > 0n && allocated > budget;
            const running =
              !c.archivedAt &&
              c.status === "live" &&
              (!c.endDate || c.endDate >= today) &&
              (!c.startDate || c.startDate <= today);

            return (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="cmp-card no-underline">
                <div className="cmp-card-top">
                  <span
                    className="cmp-status"
                    style={{
                      color: CAMPAIGN_STATUS_COLOR[c.status],
                      borderColor: CAMPAIGN_STATUS_COLOR[c.status],
                    }}
                  >
                    {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                  </span>
                  {running ? <span className="cmp-live" title="Running today">●</span> : null}
                  {c.archivedAt ? <span className="cmp-archived">archived</span> : null}
                </div>

                <div className="cmp-name">{c.name}</div>
                {c.objective ? <div className="cmp-obj">{c.objective}</div> : null}

                <div className="cmp-meta">
                  <span>{fmtRange(c.startDate, c.endDate)}</span>
                  <span>{c.ownerName ?? "no owner"}</span>
                </div>

                {budget > 0n ? (
                  <div className="cmp-budget">
                    <div className="cmp-bar">
                      <span
                        className={`cmp-bar-fill ${over ? "is-over" : ""}`}
                        style={{ width: `${over ? 100 : pct}%` }}
                      />
                    </div>
                    <div className="cmp-budget-line">
                      <span className={over ? "is-over" : ""}>
                        {formatInrFromPaise(allocated)} allocated
                      </span>
                      <span className="text-text-3">of {formatInrFromPaise(budget)}</span>
                    </div>
                    {over ? (
                      <div className="cmp-warn">
                        Over budget by {formatInrFromPaise(allocated - budget)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="cmp-budget-line">
                    <span className="text-text-3">No budget set</span>
                  </div>
                )}

                <div className="cmp-stats">
                  <span><strong>{s?.items ?? 0}</strong> items</span>
                  <span><strong>{s?.open ?? 0}</strong> open</span>
                  <span><strong>{s?.live ?? 0}</strong> published</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

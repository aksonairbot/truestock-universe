// apps/web/app/campaigns/[id]/page.tsx
//
// THE MEDIA PLAN. This is the page a digital marketing lead actually works
// from: channels down the side, weeks across the top, every scheduled piece
// sitting in its cell, and the budget adding up underneath.
//
// The grid is the point. A list of posts sorted by date tells you what's
// next; a channel × week grid tells you the thing a list can't — that you
// have four LinkedIn posts in week one and nothing in week three, or that
// Instagram is carrying the whole campaign on its own.
//
// Data wall: the campaign header is visible to everyone (planning is shared
// context), but the ITEMS obey the same admin/manager-department/own-tasks
// scope as /tasks. A member sees the plan's shape and their own work in it.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, campaigns, tasks, users, projects, eq, and, sql, asc } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isPrivileged, getDepartmentScope } from "@/lib/access";
import { CHANNEL_COLOR, CHANNEL_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/content";
import {
  CAMPAIGN_STATUS_COLOR,
  CAMPAIGN_STATUS_LABEL,
  weekStarts,
  weekStartOf,
  shortDate,
  paiseToRupeeInput,
} from "@/lib/campaigns";
import { formatInrFromPaise } from "@/lib/format";
import { CampaignEdit } from "./campaign-edit";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignPlanPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const me = await getCurrentUser();
  const canPlan = isPrivileged(me);
  const deptScope = getDepartmentScope(me);
  const db = getDb();

  const scope = isAdmin(me)
    ? sql`1=1`
    : deptScope
      ? sql`(${tasks.assigneeId} in (select id from users where department_id = ${deptScope}) or ${tasks.createdById} in (select id from users where department_id = ${deptScope}))`
      : sql`(${tasks.assigneeId} = ${me.id} or ${tasks.createdById} = ${me.id})`;

  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      objective: campaigns.objective,
      status: campaigns.status,
      startDate: campaigns.startDate,
      endDate: campaigns.endDate,
      budgetPaise: campaigns.budgetPaise,
      ownerId: campaigns.ownerId,
      ownerName: users.name,
      archivedAt: campaigns.archivedAt,
    })
    .from(campaigns)
    .leftJoin(users, eq(campaigns.ownerId, users.id))
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) notFound();

  const [items, owners] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        channel: tasks.contentChannel,
        stage: tasks.contentStage,
        publishAt: tasks.publishAt,
        approvedAt: tasks.contentApprovedAt,
        publishState: tasks.publishState,
        budgetPaise: tasks.budgetPaise,
        assignee: users.name,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.campaignId, id), scope))
      .orderBy(asc(tasks.publishAt), asc(tasks.createdAt))
      .limit(500),

    canPlan
      ? db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(and(eq(users.isActive, true), sql`${users.role} <> 'agent'::user_role`))
          .orderBy(asc(users.name))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);

  // ---- budget roll-up ----
  const allocated = items.reduce((sum, t) => sum + (t.budgetPaise ?? 0n), 0n);
  const budget = campaign.budgetPaise ?? 0n;
  const over = budget > 0n && allocated > budget;
  const pct = budget > 0n ? Math.min(100, Number((allocated * 100n) / budget)) : 0;

  // ---- grid axes ----
  // Weeks come from the campaign window when it has one, and otherwise from
  // the items themselves — a campaign with no dates still has a shape.
  const scheduledItems = items.filter((t) => t.publishAt);
  const itemWeeks = scheduledItems.map((t) =>
    weekStartOf(t.publishAt instanceof Date ? t.publishAt : new Date(t.publishAt!)),
  );

  let weeks: string[] = [];
  if (campaign.startDate && campaign.endDate) {
    weeks = weekStarts(campaign.startDate, campaign.endDate);
  }
  if (weeks.length === 0 && itemWeeks.length > 0) {
    weeks = Array.from(new Set(itemWeeks)).sort().slice(0, 26);
  }

  // Channels present in this campaign, in the canonical channel order.
  const channelsUsed = Array.from(
    new Set(scheduledItems.map((t) => t.channel).filter(Boolean) as string[]),
  );

  // cell key: `${channel}|${weekStart}`
  const cells = new Map<string, typeof scheduledItems>();
  for (const t of scheduledItems) {
    if (!t.channel) continue;
    const wk = weekStartOf(t.publishAt instanceof Date ? t.publishAt : new Date(t.publishAt!));
    const key = `${t.channel}|${wk}`;
    const arr = cells.get(key) ?? [];
    arr.push(t);
    cells.set(key, arr);
  }

  const unscheduled = items.filter((t) => !t.publishAt);
  const openCount = items.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const liveCount = items.filter((t) => t.publishState === "published").length;
  const unapproved = scheduledItems.filter((t) => !t.approvedAt).length;

  const gridUsable = weeks.length > 0 && channelsUsed.length > 0;

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="cmp-status"
              style={{
                color: CAMPAIGN_STATUS_COLOR[campaign.status],
                borderColor: CAMPAIGN_STATUS_COLOR[campaign.status],
              }}
            >
              {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
            </span>
            <div className="page-title">{campaign.name}</div>
          </div>
          <div className="page-sub">
            {items.length} items · {openCount} open · {liveCount} published
            {unapproved > 0 ? ` · ${unapproved} awaiting approval` : null}
            {campaign.ownerName ? ` · ${campaign.ownerName}` : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/campaigns" className="btn btn-ghost btn-sm">← Campaigns</Link>
          <Link href={`/tasks?campaign=${campaign.id}`} className="btn btn-ghost btn-sm">All work</Link>
          <Link href={`/tasks/new?content=1&campaign=${campaign.id}`} className="btn btn-primary btn-sm">Add item</Link>
        </div>
      </div>

      {campaign.objective ? <div className="cmp-objective">{campaign.objective}</div> : null}

      {/* ---- budget ---- */}
      <div className="card cmp-budget-card">
        <div className="cmp-budget-nums">
          <div className="cmp-num">
            <span className="cmp-num-v">{formatInrFromPaise(budget)}</span>
            <span className="cmp-num-l">budget</span>
          </div>
          <div className="cmp-num">
            <span className={`cmp-num-v ${over ? "is-over" : ""}`}>{formatInrFromPaise(allocated)}</span>
            <span className="cmp-num-l">allocated across {items.length} items</span>
          </div>
          <div className="cmp-num">
            <span className="cmp-num-v">
              {budget > 0n ? formatInrFromPaise(over ? allocated - budget : budget - allocated) : "—"}
            </span>
            <span className="cmp-num-l">{over ? "over" : "unallocated"}</span>
          </div>
        </div>
        {budget > 0n ? (
          <div className="cmp-bar cmp-bar-lg">
            <span className={`cmp-bar-fill ${over ? "is-over" : ""}`} style={{ width: `${over ? 100 : pct}%` }} />
          </div>
        ) : (
          <div className="text-text-3 text-[11.5px]">
            No budget set for this campaign — line-item amounts still add up above.
          </div>
        )}
      </div>

      {/* ---- the plan grid ---- */}
      <div className="section-title mt-6">The plan</div>
      {gridUsable ? (
        <div className="plan-wrap">
          <div className="plan" style={{ gridTemplateColumns: `140px repeat(${weeks.length}, minmax(120px, 1fr))` }}>
            <div className="plan-corner">Channel</div>
            {weeks.map((w) => (
              <div key={w} className="plan-wk">
                <span className="plan-wk-d">{shortDate(w)}</span>
                <span className="plan-wk-l">week of</span>
              </div>
            ))}

            {channelsUsed.map((ch) => (
              <div key={ch} style={{ display: "contents" }}>
                <div className="plan-ch">
                  <span className="plan-ch-dot" style={{ background: CHANNEL_COLOR[ch] ?? "var(--text-3)" }} />
                  {CHANNEL_LABEL[ch] ?? ch}
                </div>
                {weeks.map((w) => {
                  const inCell = cells.get(`${ch}|${w}`) ?? [];
                  return (
                    <div key={`${ch}|${w}`} className={`plan-cell ${inCell.length ? "has-items" : ""}`}>
                      {inCell.map((t) => (
                        <Link
                          key={t.id}
                          href={`/tasks/${t.id}`}
                          className={`plan-item no-underline ${t.publishState === "published" ? "is-live" : ""} ${
                            t.approvedAt ? "" : "is-unapproved"
                          }`}
                          style={{ borderLeftColor: CHANNEL_COLOR[ch] ?? "var(--text-3)" }}
                          title={`${t.title} · ${STAGE_LABEL[t.stage ?? "idea"]} · ${t.assignee ?? "unassigned"}`}
                        >
                          {t.title}
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="text-text-2 mb-1">The grid needs dates and channels.</div>
          <div className="text-text-3 text-[12px]">
            Give the campaign a start and end date, then set a channel and publish slot on its items —
            they&rsquo;ll lay out here by week.
          </div>
        </div>
      )}

      {/* ---- items without a slot ---- */}
      {unscheduled.length > 0 ? (
        <>
          <div className="section-title mt-6">Not scheduled yet ({unscheduled.length})</div>
          <div className="card">
            <ul className="content-backlog">
              {unscheduled.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="content-backlog-row">
                    {t.channel ? (
                      <span
                        className="content-chip"
                        style={{ color: CHANNEL_COLOR[t.channel], borderColor: CHANNEL_COLOR[t.channel] }}
                      >
                        {CHANNEL_LABEL[t.channel]}
                      </span>
                    ) : (
                      <span className="content-chip" style={{ color: "var(--text-3)", borderColor: "var(--border)" }}>
                        task
                      </span>
                    )}
                    <span className="content-backlog-title">{t.title}</span>
                    {t.stage ? (
                      <span
                        className="content-chip"
                        style={{ color: STAGE_COLOR[t.stage], borderColor: STAGE_COLOR[t.stage] }}
                      >
                        {STAGE_LABEL[t.stage]}
                      </span>
                    ) : null}
                    {(t.budgetPaise ?? 0n) > 0n ? (
                      <span className="cmp-item-money">{formatInrFromPaise(t.budgetPaise)}</span>
                    ) : null}
                    <span className="content-backlog-who">{t.assignee ?? "unassigned"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {items.length === 0 ? (
        <div className="card text-center py-12 mt-4">
          <div className="text-text-2 mb-2">Nothing filed under this campaign yet.</div>
          <div className="text-text-3 text-[12px] mb-3">
            Open any task and pick this campaign in its Campaign block — posts, ads, emails and the work
            behind them all belong here.
          </div>
          <Link href={`/tasks/new?content=1&campaign=${campaign.id}`} className="btn btn-primary btn-sm">Capture the first item</Link>
        </div>
      ) : null}

      {canPlan ? (
        <CampaignEdit
          campaignId={campaign.id}
          name={campaign.name}
          objective={campaign.objective}
          status={campaign.status}
          startDate={campaign.startDate}
          endDate={campaign.endDate}
          budget={paiseToRupeeInput(campaign.budgetPaise)}
          ownerId={campaign.ownerId}
          owners={owners}
          archived={Boolean(campaign.archivedAt)}
        />
      ) : null}
    </div>
  );
}

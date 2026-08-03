// apps/web/app/settings/health/page.tsx
//
// Deploy health check. Admin-only.
//
// WHY THIS EXISTS
// SeekPeak is self-hosted: a deploy can succeed (build green, service up) and
// still leave the app half-broken because the migration step didn't run or an
// env var wasn't set on the box. That failure is invisible — pages render,
// then one feature throws "column does not exist" for whoever touches it
// first. This page answers "did the deploy actually land?" in one look.
//
// FIRST RULE OF A DIAGNOSTICS PAGE: IT MUST NOT CRASH.
// The first version of this page did exactly that — it hit the generic
// "Something went wrong" boundary, which is the least useful possible outcome
// for the one page you open when something is wrong. Every probe below is now
// individually guarded, and anything unexpected is RENDERED as a finding
// rather than thrown. Showing the error text is correct here: the page is
// admin-only and diagnosing is its entire job.
//
// SAFETY RULE: this page reports whether a secret is PRESENT, never what it
// is. No env value is ever rendered. The only exception is NEXT_PUBLIC_APP_URL,
// which is public by definition and whose value is the thing most likely to be
// wrong (it must be the public https origin or signed media links break).

import Link from "next/link";
import { getDb, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { isPublishConfigured, isAutoPublishEnabled } from "@/lib/upload-post";
import { outboundStatus, isOutboundEnabled, inQuietHours } from "@/lib/outbound";
import { access } from "fs/promises";
import { constants as FS } from "node:fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health · SeekPeak",
  description: "Deploy and configuration health",
};

type State = "ok" | "warn" | "bad" | "off";

/** Each shipped feature and the schema it needs. Grouped by migration so a
 *  missing row tells you exactly which file didn't run.
 *  ADD A PROBE HERE FOR EVERY NEW MIGRATION — otherwise this page will claim
 *  "all applied" while a feature is quietly broken. */
const SCHEMA_CHECKS: Array<{
  migration: string;
  feature: string;
  table?: string;
  taskColumns?: string[];
  /** Columns on a table other than `tasks`. */
  otherColumns?: Array<{ table: string; column: string }>;
  /** For migrations that add an enum value rather than a column. */
  enumValue?: { type: string; value: string };
  /** For migrations whose entire content is an index. */
  index?: { table: string; name: string };
}> = [
  { migration: "0021_task_links", feature: "Figma / social links on tasks", table: "task_links" },
  {
    migration: "0022_content_pipeline",
    feature: "Content channel, stage and publish slot",
    taskColumns: ["content_channel", "content_stage", "publish_at"],
  },
  {
    migration: "0023_content_approval",
    feature: "Approval gate",
    taskColumns: ["content_approved_by_id", "content_approved_at", "compliance_checked"],
  },
  {
    migration: "0024_publishing",
    feature: "Publishing handoff",
    taskColumns: ["publish_state", "published_url", "published_at", "publish_ref", "publish_error", "publish_profile"],
  },
  {
    migration: "0025_campaigns",
    feature: "Campaigns and media-plan budgets",
    table: "campaigns",
    taskColumns: ["campaign_id", "budget_paise"],
  },
  {
    migration: "0026_post_composer",
    feature: "Post copy, first comment and content pillars",
    taskColumns: ["post_caption", "post_first_comment", "content_pillar"],
  },
  {
    migration: "0027_post_variants",
    feature: "Per-network variants of one post",
    taskColumns: ["post_group_id"],
  },
  {
    migration: "0028_content_watch",
    feature: "Content watchdog notifications",
    enumValue: { type: "notification_kind", value: "content_at_risk" },
  },
  {
    migration: "0029_outbound",
    feature: "Outbound delivery and the personal off switch",
    otherColumns: [
      { table: "users", column: "notify_outbound" },
      { table: "notifications", column: "delivered_at" },
    ],
  },
  {
    migration: "0030_contribution_tier",
    feature: "Contribution standing (private to the person, their manager and admins)",
    table: "contribution_tier_history",
    otherColumns: [
      { table: "users", column: "contribution_tier" },
      { table: "users", column: "contribution_tier_note" },
      { table: "users", column: "contribution_tier_set_by" },
      { table: "users", column: "contribution_tier_set_at" },
    ],
    enumValue: { type: "notification_kind", value: "standing_updated" },
  },
  {
    migration: "0031_music",
    feature: "The office jukebox (shared queue, boosts, daily playlists)",
    table: "music_tracks",
    otherColumns: [
      { table: "music_votes", column: "kind" },
      { table: "music_player_state", column: "last_beat_at" },
    ],
  },
  {
    migration: "0032_music_position",
    feature: "Live playback position on every screen",
    otherColumns: [
      { table: "music_player_state", column: "position_seconds" },
      { table: "music_player_state", column: "duration_seconds" },
    ],
  },
  {
    migration: "0033_music_mine",
    feature: "\"Your songs\" — one-tap re-queue from your own history",
    // Index-only migration, so the probe checks pg_indexes rather than a column.
    index: { table: "music_tracks", name: "music_tracks_added_by_idx" },
  },
  {
    migration: "0034_improvement_tasks",
    feature: "Improvement tasks a manager asks for on the rating page",
    taskColumns: ["improvement_for"],
  },
  {
    migration: "0035_music_dj",
    feature: "Granting the office speaker to individuals",
    otherColumns: [{ table: "users", column: "music_dj" }],
  },
];

/**
 * db.execute() returns different shapes across drivers — postgres-js gives an
 * array-like RowList, node-postgres gives { rows }. Normalise once so a driver
 * swap can't turn this page into a crash.
 */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = (result ?? {}) as { rows?: unknown };
  if (Array.isArray(maybe.rows)) return maybe.rows as Array<Record<string, unknown>>;
  return [];
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Row({ label, state, detail }: { label: string; state: State; detail?: string }) {
  return (
    <div className="hrow">
      <span className={`hdot is-${state}`} aria-hidden="true" />
      <span className="hrow-label">{label}</span>
      {detail ? <span className="hrow-detail">{detail}</span> : null}
    </div>
  );
}

export default async function HealthPage() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <div className="page-content">
        <div className="card text-center py-16">
          <div className="text-text-2">Health checks are visible to admins only.</div>
        </div>
      </div>
    );
  }

  // Anything that goes wrong while probing is collected and shown, never thrown.
  const problems: string[] = [];

  // ---- database + schema ----
  let dbOk = false;
  let dbMs = 0;
  let dbError = "";
  let taskColumns = new Set<string>();
  let tableNames = new Set<string>();
  let enumValues = new Set<string>();
  let indexNames = new Set<string>();
  let otherColumns = new Set<string>();

  try {
    const db = getDb();
    const t0 = Date.now();
    const [colRes, tblRes] = await Promise.all([
      db.execute(sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks'`),
      db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`),
    ]);
    // Columns on tables other than `tasks`.
    //
    // This list MUST include every table named in a SCHEMA_CHECKS otherColumns
    // entry. It was users + notifications only, which meant the music probes
    // added later would have reported "missing" on a perfectly healthy box —
    // a health page that cries wolf is worse than no health page. If you add a
    // probe for a new table, add the table here.
    try {
      const otherRes = await db.execute(
        sql`select table_name, column_name from information_schema.columns
            where table_schema = 'public'
              and table_name in ('users', 'notifications', 'contribution_tier_history',
                                 'music_tracks', 'music_votes', 'music_player_state')`,
      );
      for (const r of rowsOf(otherRes)) {
        if (typeof r.table_name === "string" && typeof r.column_name === "string") {
          otherColumns.add(`${r.table_name}.${r.column_name}`);
        }
      }
    } catch {
      /* reported as missing below, which is the right signal */
    }

    // Indexes, for migrations that add nothing else. Without this an
    // index-only migration is unverifiable and quietly assumed fine.
    try {
      const idxRes = await db.execute(
        sql`select tablename, indexname from pg_indexes where schemaname = 'public'`,
      );
      for (const r of rowsOf(idxRes)) {
        if (typeof r.tablename === "string" && typeof r.indexname === "string") {
          indexNames.add(`${r.tablename}.${r.indexname}`);
        }
      }
    } catch {
      /* reported as missing below, which is the right signal */
    }

    // Enum values live in pg_enum, not information_schema — probed separately
    // so a migration that only adds one is still verifiable here.
    try {
      const enumRes = await db.execute(
        sql`select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid = t.oid`,
      );
      for (const r of rowsOf(enumRes)) {
        if (typeof r.typname === "string" && typeof r.enumlabel === "string") {
          enumValues.add(`${r.typname}.${r.enumlabel}`);
        }
      }
    } catch {
      /* the schema rows below will show as missing, which is the right signal */
    }
    dbMs = Date.now() - t0;
    for (const r of rowsOf(colRes)) if (typeof r.column_name === "string") taskColumns.add(r.column_name);
    for (const r of rowsOf(tblRes)) if (typeof r.table_name === "string") tableNames.add(r.table_name);
    dbOk = taskColumns.size > 0;
    if (!dbOk) dbError = "connected, but the tasks table reported no columns";
  } catch (e) {
    dbError = msg(e);
    problems.push(`Schema probe failed: ${dbError}`);
  }

  const schemaResults = SCHEMA_CHECKS.map((c) => {
    if (!dbOk) return { ...c, missing: ["(schema could not be read)"] };
    const missing: string[] = [];
    if (c.table && !tableNames.has(c.table)) missing.push(`table ${c.table}`);
    for (const col of c.taskColumns ?? []) if (!taskColumns.has(col)) missing.push(`tasks.${col}`);
    for (const oc of c.otherColumns ?? []) {
      if (!otherColumns.has(`${oc.table}.${oc.column}`)) missing.push(`${oc.table}.${oc.column}`);
    }
    if (c.index && !indexNames.has(`${c.index.table}.${c.index.name}`)) {
      missing.push(`index ${c.index.name}`);
    }
    if (c.enumValue && !enumValues.has(`${c.enumValue.type}.${c.enumValue.value}`)) {
      missing.push(`${c.enumValue.type} value '${c.enumValue.value}'`);
    }
    return { ...c, missing };
  });
  const pending = schemaResults.filter((r) => r.missing.length > 0);

  // ---- uploads directory ----
  let uploadsState: State = "ok";
  let uploadsDetail = "readable and writable";
  const uploadsDir = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
  try {
    await access(uploadsDir, FS.R_OK | FS.W_OK);
  } catch {
    uploadsState = "bad";
    uploadsDetail = "missing or not writable — attachments will fail";
  }

  // ---- configuration (presence only, never values) ----
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const appUrlState: State = !appUrl ? "bad" : appUrl.startsWith("https://") ? "ok" : "warn";
  const appUrlDetail = !appUrl
    ? "not set — signed media links for publishing cannot be built"
    : appUrl.startsWith("https://")
      ? appUrl
      : `${appUrl} — should be the public https origin in production`;

  const hasCronSecret = Boolean(process.env.CRON_SECRET);
  // Naming the casualties matters: "scheduled jobs will refuse to run" reads
  // as minor until you know it means overdue recurring tasks never roll
  // forward and nobody's morning briefing is ever built.
  const cronDetail = hasCronSecret
    ? "set"
    : "NOT SET — the daily review, recurring-task roll-forward, morning briefings and the publish sweep all refuse to run";
  const hasAi = Boolean(process.env.OLLAMA_BASE_URL || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY);

  // Presence only, never the value — the whole point of this page is that you
  // can confirm a credential arrived without ever putting it on a screen.
  // A missing key is deliberately "off", not "bad": the jukebox works without
  // one via YouTube's public oEmbed endpoint. This only adds duration and
  // search. Reporting it as a failure would send someone hunting for a problem
  // that isn't there.
  const hasYouTubeKey = Boolean(process.env.YOUTUBE_API_KEY);
  const youtubeDetail = hasYouTubeKey
    ? "set — track length and in-app search are available"
    : "not set — the jukebox still works (titles and artwork come from YouTube's public oEmbed), but there's no search box and no length limit on what people queue";

  const outbound = outboundStatus();
  const waConfigured = outbound.configured.length > 0;
  const waLive = isOutboundEnabled();
  const quiet = inQuietHours();

  let publishConfigured = false;
  let autoPublish = false;
  try {
    publishConfigured = isPublishConfigured();
    autoPublish = isAutoPublishEnabled();
  } catch (e) {
    problems.push(`Publishing config check failed: ${msg(e)}`);
  }

  // ---- what's actually flowing through the pipeline ----
  let counts: { content: number; approved: number; scheduled: number; published: number; failed: number } | null = null;
  const canReadPipeline = dbOk && pending.length === 0;
  if (canReadPipeline) {
    try {
      const db = getDb();
      const res = await db.execute(sql`
        select
          count(*) filter (where content_channel is not null)::int as content,
          count(*) filter (where content_approved_at is not null)::int as approved,
          count(*) filter (where content_stage = 'scheduled')::int as scheduled,
          count(*) filter (where publish_state = 'published')::int as published,
          count(*) filter (where publish_state = 'failed')::int as failed
        from tasks
      `);
      const r = rowsOf(res)[0];
      if (r) {
        counts = {
          content: Number(r.content) || 0,
          approved: Number(r.approved) || 0,
          scheduled: Number(r.scheduled) || 0,
          published: Number(r.published) || 0,
          failed: Number(r.failed) || 0,
        };
      }
    } catch (e) {
      problems.push(`Pipeline counts failed: ${msg(e)}`);
    }
  }

  // The headline is DERIVED from the rows below, never asserted separately.
  // The first version said "Everything the app needs is in place" while a red
  // row sat underneath it — a summary that contradicts its own detail is worse
  // than no summary, because it teaches you to stop reading.
  const dbState: State = dbOk ? (dbMs > 500 ? "warn" : "ok") : "bad";
  const rowStates: State[] = [
    dbState,
    ...schemaResults.map((r): State => (r.missing.length === 0 ? "ok" : "bad")),
    appUrlState,
    uploadsState,
    hasCronSecret ? "ok" : "bad",
    hasAi ? "ok" : "off",
    waConfigured ? "ok" : "off",
    waLive ? "warn" : "off",
    publishConfigured ? "ok" : "off",
    // Unattended publishing being ON is a state to notice, not a fault.
    autoPublish ? "warn" : "off",
    ...(counts && counts.failed > 0 ? (["bad"] as State[]) : []),
    ...problems.map((): State => "bad"),
  ];
  const badCount = rowStates.filter((x) => x === "bad").length;
  const warnCount = rowStates.filter((x) => x === "warn").length;
  const headline =
    badCount > 0
      ? `${badCount} ${badCount === 1 ? "thing needs" : "things need"} attention.`
      : warnCount > 0
        ? `Working — ${warnCount} ${warnCount === 1 ? "thing is" : "things are"} worth a look.`
        : "Everything the app needs is in place.";

  return (
    <div className="page-content max-w-[820px] motion-stagger">
      <div className="page-head">
        <div>
          <div className="page-title">Health</div>
          <div className="page-sub">
            {headline}
          </div>
        </div>
        <Link href="/settings" className="btn btn-ghost btn-sm">← Settings</Link>
      </div>

      {/* Unexpected failures surface here instead of replacing the whole page
          with a generic error screen. */}
      {problems.length > 0 ? (
        <div className="card mb-4">
          <div className="hsec-head">
            Probe errors
            <span className="hsec-badge is-bad">{problems.length}</span>
          </div>
          <div className="hsec-body">
            {problems.map((p, i) => (
              <Row key={i} label={p} state="bad" />
            ))}
          </div>
        </div>
      ) : null}

      <div className="card mb-4">
        <div className="hsec-head">Database</div>
        <div className="hsec-body">
          <Row
            label="Connection"
            state={dbState}
            detail={dbOk ? `${dbMs} ms` : dbError || "unreachable — check DATABASE_URL"}
          />
        </div>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">
          Migrations
          {pending.length > 0 ? (
            <span className="hsec-badge is-bad">{pending.length} not applied</span>
          ) : (
            <span className="hsec-badge is-ok">all applied</span>
          )}
        </div>
        <div className="hsec-body">
          {schemaResults.map((r) => (
            <Row
              key={r.migration}
              label={`${r.migration} — ${r.feature}`}
              state={r.missing.length === 0 ? "ok" : "bad"}
              detail={r.missing.length === 0 ? undefined : `missing ${r.missing.join(", ")}`}
            />
          ))}
          {pending.length > 0 ? (
            <div className="hnote">
              Run the migration step on the server, then reload this page:
              <code className="hcode">pnpm --filter @tu/db migrate</code>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">Configuration</div>
        <div className="hsec-body">
          <Row label="Public app URL" state={appUrlState} detail={appUrlDetail} />
          <Row label="Uploads directory" state={uploadsState} detail={uploadsDetail} />
          <Row
            label="Cron secret"
            state={hasCronSecret ? "ok" : "bad"}
            detail={cronDetail}
          />
          <Row
            label="AI provider"
            state={hasAi ? "ok" : "off"}
            detail={hasAi ? "configured" : "none configured — Suggest and briefings are unavailable"}
          />
          <Row
            label="YouTube API key"
            state={hasYouTubeKey ? "ok" : "off"}
            detail={youtubeDetail}
          />
        </div>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">Outbound messages</div>
        <div className="hsec-body">
          <Row
            label="Provider credentials"
            state={waConfigured ? "ok" : "off"}
            detail={waConfigured ? outbound.configured.join(", ") : "none set — nothing can be sent"}
          />
          <Row
            label="Delivery"
            state={waLive ? "warn" : "off"}
            detail={
              waLive
                ? `ON via ${outbound.active} — assignments and risks are sent outside the app`
                : 'off — set EMAIL_ENABLED="true" (or WHATSAPP_ENABLED) to switch it on'
            }
          />
          {waLive && outbound.active === "whatsapp" ? (
            <Row
              label="Quiet hours (21:30–08:00 IST)"
              state="ok"
              detail={quiet ? "active right now — messages are held until 8am" : "not active"}
            />
          ) : null}
        </div>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">Publishing</div>
        <div className="hsec-body">
          <Row
            label="Upload-post credentials"
            state={publishConfigured ? "ok" : "off"}
            detail={
              publishConfigured
                ? "connected"
                : "not set — content can still be tracked and marked published by hand"
            }
          />
          <Row
            label="Unattended publishing"
            state={autoPublish ? "warn" : "off"}
            detail={
              autoPublish
                ? "ON — approved, compliance-checked content posts automatically at its slot"
                : "off — nothing posts without someone pressing Publish"
            }
          />
          {counts && counts.failed > 0 ? (
            <Row label="Failed posts" state="bad" detail={`${counts.failed} need a retry`} />
          ) : null}
        </div>
      </div>

      {counts ? (
        <div className="card">
          <div className="hsec-head">Content pipeline</div>
          <div className="hsec-body">
            <div className="hstats">
              <div className="hstat"><span className="hstat-n">{counts.content}</span><span className="hstat-l">content items</span></div>
              <div className="hstat"><span className="hstat-n">{counts.approved}</span><span className="hstat-l">approved</span></div>
              <div className="hstat"><span className="hstat-n">{counts.scheduled}</span><span className="hstat-l">scheduled</span></div>
              <div className="hstat"><span className="hstat-n">{counts.published}</span><span className="hstat-l">published</span></div>
            </div>
            <div className="hnote">
              <Link href="/content" className="hlink">Open the content calendar →</Link>
              {" · "}
              <Link href="/campaigns" className="hlink">Campaigns →</Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

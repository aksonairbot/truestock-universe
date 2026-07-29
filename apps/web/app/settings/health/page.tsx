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
// SAFETY RULE: this page reports whether a secret is PRESENT, never what it
// is. No env value is ever rendered. The only exception is NEXT_PUBLIC_APP_URL,
// which is public by definition and whose value is the thing most likely to be
// wrong (it must be the public https origin or signed media links break).

import Link from "next/link";
import { getDb, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { isPublishConfigured, isAutoPublishEnabled } from "@/lib/upload-post";
import { access, constants } from "fs/promises";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Health · SeekPeak",
  description: "Deploy and configuration health",
};

type State = "ok" | "warn" | "bad" | "off";

/** Each shipped feature and the schema it needs. Grouped by migration so a
 *  missing row tells you exactly which file didn't run. */
const SCHEMA_CHECKS: Array<{
  migration: string;
  feature: string;
  table?: string;
  taskColumns?: string[];
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
];

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

  // ---- database + schema ----
  const db = getDb();
  const t0 = Date.now();
  let dbOk = true;
  let dbMs = 0;
  let taskColumns = new Set<string>();
  let tableNames = new Set<string>();

  try {
    const [colRows, tblRows] = await Promise.all([
      db.execute(sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tasks'`),
      db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`),
    ]);
    dbMs = Date.now() - t0;
    taskColumns = new Set((colRows as unknown as Array<{ column_name: string }>).map((r) => r.column_name));
    tableNames = new Set((tblRows as unknown as Array<{ table_name: string }>).map((r) => r.table_name));
  } catch {
    dbOk = false;
    dbMs = Date.now() - t0;
  }

  const schemaResults = SCHEMA_CHECKS.map((c) => {
    if (!dbOk) return { ...c, missing: ["(database unreachable)"] };
    const missing: string[] = [];
    if (c.table && !tableNames.has(c.table)) missing.push(`table ${c.table}`);
    for (const col of c.taskColumns ?? []) if (!taskColumns.has(col)) missing.push(`tasks.${col}`);
    return { ...c, missing };
  });
  const pendingMigrations = schemaResults.filter((r) => r.missing.length > 0);

  // ---- uploads directory ----
  const uploadsDir = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
  let uploadsState: State = "ok";
  let uploadsDetail = "readable and writable";
  try {
    await access(uploadsDir, constants.R_OK | constants.W_OK);
  } catch {
    uploadsState = "bad";
    uploadsDetail = "missing or not writable — attachments will fail";
  }

  // ---- configuration (presence only, never values) ----
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const appUrlState: State = !appUrl ? "bad" : appUrl.startsWith("https://") ? "ok" : "warn";
  const appUrlDetail = !appUrl
    ? "not set — signed media links for publishing cannot be built"
    : appUrl.startsWith("https://")
      ? appUrl
      : `${appUrl} — should be the public https origin in production`;

  const publishConfigured = isPublishConfigured();
  const autoPublish = isAutoPublishEnabled();

  // ---- what's actually flowing through the pipeline ----
  let counts = { content: 0, approved: 0, scheduled: 0, published: 0, failed: 0 };
  const pipelineReadable = dbOk && pendingMigrations.length === 0;
  if (pipelineReadable) {
    try {
      const rows = await db.execute(sql`
        select
          count(*) filter (where content_channel is not null)::int as content,
          count(*) filter (where content_approved_at is not null)::int as approved,
          count(*) filter (where content_stage = 'scheduled')::int as scheduled,
          count(*) filter (where publish_state = 'published')::int as published,
          count(*) filter (where publish_state = 'failed')::int as failed
        from tasks
      `);
      const r = (rows as unknown as Array<Record<string, number>>)[0];
      if (r) {
        counts = {
          content: Number(r.content) || 0,
          approved: Number(r.approved) || 0,
          scheduled: Number(r.scheduled) || 0,
          published: Number(r.published) || 0,
          failed: Number(r.failed) || 0,
        };
      }
    } catch {
      /* counts stay zero — the schema rows above already explain why */
    }
  }

  const allGood = dbOk && pendingMigrations.length === 0 && uploadsState === "ok" && appUrlState !== "bad";

  return (
    <div className="page-content max-w-[820px]">
      <div className="page-head">
        <div>
          <div className="page-title">Health</div>
          <div className="page-sub">
            {allGood ? "Everything the app needs is in place." : "Some things need attention — see below."}
          </div>
        </div>
        <Link href="/settings" className="btn btn-ghost btn-sm">← Settings</Link>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">Database</div>
        <div className="hsec-body">
          <Row
            label="Connection"
            state={dbOk ? (dbMs > 500 ? "warn" : "ok") : "bad"}
            detail={dbOk ? `${dbMs} ms` : "unreachable — check DATABASE_URL"}
          />
        </div>
      </div>

      <div className="card mb-4">
        <div className="hsec-head">
          Migrations
          {pendingMigrations.length > 0 ? (
            <span className="hsec-badge is-bad">{pendingMigrations.length} not applied</span>
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
          {pendingMigrations.length > 0 ? (
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
            state={process.env.CRON_SECRET ? "ok" : "bad"}
            detail={process.env.CRON_SECRET ? "set" : "not set — scheduled jobs will refuse to run"}
          />
          <Row
            label="AI provider"
            state={
              process.env.OLLAMA_BASE_URL || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY ? "ok" : "off"
            }
            detail={
              process.env.OLLAMA_BASE_URL || process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY
                ? "configured"
                : "none configured — Suggest and briefings are unavailable"
            }
          />
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
          {counts.failed > 0 ? (
            <Row label="Failed posts" state="bad" detail={`${counts.failed} need a retry`} />
          ) : null}
        </div>
      </div>

      {pipelineReadable ? (
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

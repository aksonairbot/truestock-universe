/**
 * Demo seed — populate the DB with a realistic team and task set so the UI
 * has something to render. Safe to inspect, easy to reverse.
 *
 * Usage (from repo root):
 *   pnpm db:seed-demo            # insert (idempotent on members/projects via slug/email)
 *   pnpm db:seed-demo -- --reset # wipe demo data, then insert fresh
 *
 * Namespacing for safe cleanup:
 *   • Demo members:   email ends in @demo.truestock.in
 *   • Demo projects:  slug starts with "demo-"
 *   • Demo tasks:     belong to a demo project
 *   • Demo comments:  authored by a demo member OR on a demo task
 *
 * The existing real user (aks@truestock.in) and the existing "skynet"
 * project + their tasks are NEVER touched by this script.
 */

import { config } from "dotenv";
config({ path: "../../.env" });

import {
  getDb,
  closeDb,
  users,
  projects,
  tasks,
  taskComments,
  eq,
  and,
  inArray,
  sql,
  like,
} from "./index.js";

// -----------------------------------------------------------------------------
// data
// -----------------------------------------------------------------------------

type Role = "admin" | "manager" | "member" | "viewer" | "agent";

const DEMO_DOMAIN = "demo.truestock.in";

const MEMBERS: Array<{ name: string; email: string; role: Role; tz?: string }> = [
  { name: "Priya Nair",     email: `priya.nair@${DEMO_DOMAIN}`,     role: "manager" },
  { name: "Rahul Mehta",    email: `rahul.mehta@${DEMO_DOMAIN}`,    role: "member" },
  { name: "Anjali Verma",   email: `anjali.verma@${DEMO_DOMAIN}`,   role: "member" },
  { name: "Karthik Iyer",   email: `karthik.iyer@${DEMO_DOMAIN}`,   role: "member" },
  { name: "Sneha Reddy",    email: `sneha.reddy@${DEMO_DOMAIN}`,    role: "manager" },
  { name: "Vikram Singh",   email: `vikram.singh@${DEMO_DOMAIN}`,   role: "member" },
  { name: "Divya Sharma",   email: `divya.sharma@${DEMO_DOMAIN}`,   role: "member" },
  { name: "Aarav Khanna",   email: `aarav.khanna@${DEMO_DOMAIN}`,   role: "admin" },
];

const PROJECTS = [
  { slug: "demo-stock-bee-growth", name: "Stock Bee — Growth",  color: "#F5B84A", description: "Demo · acquisition + retention work for Stock Bee" },
  { slug: "demo-bloom-launch",     name: "Bloom — Q2 launch",   color: "#F472B6", description: "Demo · Bloom Prime + Elite GTM playbook" },
  { slug: "demo-ops-finance",      name: "Ops & Finance",       color: "#22D3EE", description: "Demo · book close, vendor mgmt, OKRs" },
];

type TaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done" | "cancelled";
type TaskPriority = "low" | "med" | "high" | "urgent";

interface TaskSeed {
  projectSlug: "demo-stock-bee-growth" | "demo-bloom-launch" | "demo-ops-finance";
  title: string;
  description?: string;
  /** assignee email — null for unassigned (so delete-button surfaces) */
  assigneeEmail: string | null;
  /** creator email — defaults to first manager */
  creatorEmail?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** due date, YYYY-MM-DD or null */
  due: string | null;
  /** offset from "now" in days for created_at; negative = past */
  createdDaysAgo: number;
  /** offset for completed_at if status==done; default = createdDaysAgo */
  completedDaysAgo?: number;
  /** if status==in_progress, when did it start */
  startedDaysAgo?: number;
  /** comments to attach (author email + body + days-ago) */
  comments?: Array<{ by: string; body: string; daysAgo: number }>;
}

// -----------------------------------------------------------------------------
// task fixtures — written to look like a real fintech-team week
// -----------------------------------------------------------------------------
function buildTasks(now: Date): TaskSeed[] {
  // helpers to compute due dates relative to today
  const today = (): string => isoDate(now);
  const inDays = (d: number): string => isoDate(addDays(now, d));

  return [
    // ============================ Stock Bee — Growth ============================
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Pause underperforming Meta ads (CTR < 0.6%)",
      description: "Pull last 14d delivery report, kill ad sets below the threshold and reallocate budget to top 3 hooks.",
      assigneeEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "done",
      priority: "high",
      due: inDays(-2),
      createdDaysAgo: 4,
      completedDaysAgo: 0,
      comments: [
        { by: `rahul.mehta@${DEMO_DOMAIN}`, body: "Cut 6 ad sets. CPM down 18% vs last week.", daysAgo: 0 },
      ],
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Launch yearly plan retention email sequence (3 emails)",
      description: "Day 0 thank-you, day 30 value recap, day 90 upsell to Turbo Edge.",
      assigneeEmail: `divya.sharma@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "high",
      due: inDays(3),
      createdDaysAgo: 5,
      startedDaysAgo: 1,
      comments: [
        { by: `divya.sharma@${DEMO_DOMAIN}`, body: "Day 0 + day 30 drafted, sent for review.", daysAgo: 0 },
        { by: `priya.nair@${DEMO_DOMAIN}`, body: "LGTM. Hold day 90 till after the Bloom launch.", daysAgo: 0 },
      ],
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Compile Apr churn report — by plan + cohort",
      assigneeEmail: `sneha.reddy@${DEMO_DOMAIN}`,
      status: "review",
      priority: "med",
      due: inDays(1),
      createdDaysAgo: 3,
      comments: [
        { by: `sneha.reddy@${DEMO_DOMAIN}`, body: "Posted to /reports/churn-apr.pdf — Swift Pro churn ↑ 1.4pp, Turbo Edge flat.", daysAgo: 0 },
      ],
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "A/B test 'Try free' vs 'Start now' on landing CTA",
      assigneeEmail: `karthik.iyer@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "med",
      due: inDays(7),
      createdDaysAgo: 1,
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Refresh testimonials page with Q1 quotes",
      assigneeEmail: `anjali.verma@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "low",
      due: inDays(14),
      createdDaysAgo: 2,
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Investigate 7-day signup → activation drop (40% → 31%)",
      assigneeEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "urgent",
      due: today(),
      createdDaysAgo: 6,
      startedDaysAgo: 4,
      comments: [
        { by: `priya.nair@${DEMO_DOMAIN}`, body: "Tracking issue — Meta Pixel deduping CAPI events. EMQ dropped to 4.2.", daysAgo: 1 },
        { by: `karthik.iyer@${DEMO_DOMAIN}`, body: "Pushed pixel fix to staging. Will validate tomorrow.", daysAgo: 0 },
      ],
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Refresh creative for Stock Bee Turbo (3 variants)",
      assigneeEmail: `divya.sharma@${DEMO_DOMAIN}`,
      status: "backlog",
      priority: "med",
      due: inDays(10),
      createdDaysAgo: 0,
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Check Razorpay refund spike — Apr 2026",
      assigneeEmail: null,
      status: "backlog",
      priority: "low",
      due: null,
      createdDaysAgo: 8,
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Sunset Swift Pro ₹199 grandfather pricing",
      assigneeEmail: `aarav.khanna@${DEMO_DOMAIN}`,
      status: "review",
      priority: "med",
      due: inDays(5),
      createdDaysAgo: 9,
    },
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Outdated Twitter Ads campaign — kill or revive?",
      assigneeEmail: `rahul.mehta@${DEMO_DOMAIN}`,
      status: "cancelled",
      priority: "low",
      due: null,
      createdDaysAgo: 12,
    },

    // ============================ Bloom — Q2 launch ============================
    {
      projectSlug: "demo-bloom-launch",
      title: "Brief creative team on Bloom Prime explainer video",
      assigneeEmail: `sneha.reddy@${DEMO_DOMAIN}`,
      status: "done",
      priority: "high",
      due: inDays(-4),
      createdDaysAgo: 7,
      completedDaysAgo: 3,
      comments: [
        { by: `sneha.reddy@${DEMO_DOMAIN}`, body: "Brief sent. Vendor will deliver first cut by Fri.", daysAgo: 3 },
      ],
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Compliance review of Bloom Elite collateral",
      assigneeEmail: `aarav.khanna@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "urgent",
      due: today(),
      createdDaysAgo: 5,
      startedDaysAgo: 2,
      comments: [
        { by: `aarav.khanna@${DEMO_DOMAIN}`, body: "Two SEBI-related lines flagged. Pinged legal for guidance.", daysAgo: 1 },
      ],
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Set up Bloom Prime landing page (a/b test 2 variants)",
      assigneeEmail: `karthik.iyer@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "high",
      due: inDays(4),
      createdDaysAgo: 3,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Outreach list for Bloom Beta — first 50 customers",
      assigneeEmail: `vikram.singh@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "med",
      due: inDays(2),
      createdDaysAgo: 4,
      startedDaysAgo: 1,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Pricing matrix: Rise vs Prime vs Elite — final SKUs",
      assigneeEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "done",
      priority: "high",
      due: inDays(-6),
      createdDaysAgo: 10,
      completedDaysAgo: 6,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Webinar: 'Bloom for first-time investors' — schedule + promo",
      assigneeEmail: `anjali.verma@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "med",
      due: inDays(11),
      createdDaysAgo: 2,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Migrate Bloom Rise legacy ₹999 customers — migration email",
      assigneeEmail: `divya.sharma@${DEMO_DOMAIN}`,
      status: "backlog",
      priority: "low",
      due: null,
      createdDaysAgo: 1,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Reach out to 5 finfluencers — Bloom seeding",
      assigneeEmail: `rahul.mehta@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "med",
      due: inDays(6),
      createdDaysAgo: 6,
      startedDaysAgo: 3,
      comments: [
        { by: `rahul.mehta@${DEMO_DOMAIN}`, body: "3/5 confirmed. Waiting on the other two by Mon.", daysAgo: 2 },
      ],
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Bloom Elite — minimum-investment messaging clarity",
      assigneeEmail: null,
      status: "todo",
      priority: "med",
      due: inDays(8),
      createdDaysAgo: 0,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Beta tester onboarding doc",
      assigneeEmail: `anjali.verma@${DEMO_DOMAIN}`,
      status: "done",
      priority: "med",
      due: inDays(-1),
      createdDaysAgo: 4,
      completedDaysAgo: 1,
    },

    // ============================ Ops & Finance ============================
    {
      projectSlug: "demo-ops-finance",
      title: "Apr book close — reconcile Razorpay payouts",
      assigneeEmail: `aarav.khanna@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "urgent",
      due: today(),
      createdDaysAgo: 8,
      startedDaysAgo: 3,
      comments: [
        { by: `aarav.khanna@${DEMO_DOMAIN}`, body: "Apr 18–22 batch is missing 4 payments. Raised support ticket.", daysAgo: 1 },
      ],
    },
    {
      projectSlug: "demo-ops-finance",
      title: "GST filing for Mar–Apr period",
      assigneeEmail: `aarav.khanna@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "urgent",
      due: inDays(3),
      createdDaysAgo: 6,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Renew Mailgun annual subscription",
      assigneeEmail: `vikram.singh@${DEMO_DOMAIN}`,
      status: "review",
      priority: "med",
      due: inDays(2),
      createdDaysAgo: 9,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Sentry plan upgrade — engineering ask",
      assigneeEmail: `vikram.singh@${DEMO_DOMAIN}`,
      status: "done",
      priority: "low",
      due: inDays(-3),
      createdDaysAgo: 7,
      completedDaysAgo: 2,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Quarterly OKRs review with founders",
      assigneeEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "high",
      due: inDays(5),
      createdDaysAgo: 1,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "DigitalOcean — bump droplet to 2vCPU/4GB",
      assigneeEmail: `karthik.iyer@${DEMO_DOMAIN}`,
      status: "backlog",
      priority: "low",
      due: null,
      createdDaysAgo: 11,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Hire: senior performance marketer JD + sourcing",
      assigneeEmail: `sneha.reddy@${DEMO_DOMAIN}`,
      status: "in_progress",
      priority: "med",
      due: inDays(15),
      createdDaysAgo: 5,
      startedDaysAgo: 1,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Annual policy refresh — leave + WFH",
      assigneeEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "low",
      due: inDays(20),
      createdDaysAgo: 0,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Audit vendor list — kill anything <$5/mo unused",
      assigneeEmail: null,
      status: "backlog",
      priority: "low",
      due: null,
      createdDaysAgo: 14,
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Setup zero-trust VPN for new joiners",
      assigneeEmail: `karthik.iyer@${DEMO_DOMAIN}`,
      status: "review",
      priority: "med",
      due: inDays(4),
      createdDaysAgo: 3,
      comments: [
        { by: `karthik.iyer@${DEMO_DOMAIN}`, body: "Tailscale ACLs done. Need approval before rolling to the team.", daysAgo: 0 },
      ],
    },
    {
      projectSlug: "demo-ops-finance",
      title: "Cancelled: Slack Enterprise upsell",
      assigneeEmail: `aarav.khanna@${DEMO_DOMAIN}`,
      status: "cancelled",
      priority: "low",
      due: null,
      createdDaysAgo: 20,
    },

    // a few more bodies so today's "Created" column is not empty for everyone
    {
      projectSlug: "demo-stock-bee-growth",
      title: "Look into Stock Bee Turbo high-CPC creatives — Sneha noticed CPC up 22%",
      assigneeEmail: `sneha.reddy@${DEMO_DOMAIN}`,
      creatorEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "high",
      due: inDays(2),
      createdDaysAgo: 0,
    },
    {
      projectSlug: "demo-bloom-launch",
      title: "Spin up Bloom Telegram channel — moderation rules",
      assigneeEmail: `rahul.mehta@${DEMO_DOMAIN}`,
      creatorEmail: `priya.nair@${DEMO_DOMAIN}`,
      status: "todo",
      priority: "med",
      due: inDays(9),
      createdDaysAgo: 0,
    },
  ];
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Set hour-of-day in IST. We use 09–18 IST so timestamps look human. */
function atIstHour(daysAgo: number, hourIst: number): Date {
  const now = new Date();
  // Get YYYY-MM-DD in IST for "today minus daysAgo"
  const istYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(addDays(now, -daysAgo));
  const hh = String(hourIst).padStart(2, "0");
  return new Date(`${istYmd}T${hh}:00:00+05:30`);
}

// Pick a deterministic-ish hour for the timestamps so they don't all clump
function hourFor(daysAgo: number, salt: number): number {
  // salt 0–N maps to 9–18 spread
  return 9 + ((salt * 3 + daysAgo) % 10);
}

// -----------------------------------------------------------------------------
// run
// -----------------------------------------------------------------------------
async function main() {
  const args = new Set(process.argv.slice(2));
  const reset = args.has("--reset");

  const db = getDb();

  if (reset) {
    console.log("→ --reset: removing existing demo data");
    // 1. delete comments by demo authors OR on demo tasks
    const demoUserRows = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%@${DEMO_DOMAIN}`));
    const demoUserIds = demoUserRows.map((r) => r.id);

    const demoProjectRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(like(projects.slug, "demo-%"));
    const demoProjectIds = demoProjectRows.map((r) => r.id);

    // task ids on demo projects
    const demoTaskRows = demoProjectIds.length
      ? await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(inArray(tasks.projectId, demoProjectIds))
      : [];
    const demoTaskIds = demoTaskRows.map((r) => r.id);

    if (demoTaskIds.length || demoUserIds.length) {
      // delete comments on demo tasks
      if (demoTaskIds.length) {
        await db.delete(taskComments).where(inArray(taskComments.taskId, demoTaskIds));
      }
      // also delete any stray comments authored by demo users (e.g., on real tasks)
      if (demoUserIds.length) {
        await db.delete(taskComments).where(inArray(taskComments.authorId, demoUserIds));
      }
    }
    if (demoTaskIds.length) {
      await db.delete(tasks).where(inArray(tasks.id, demoTaskIds));
      console.log(`   ✓ deleted ${demoTaskIds.length} demo tasks`);
    }
    if (demoProjectIds.length) {
      await db.delete(projects).where(inArray(projects.id, demoProjectIds));
      console.log(`   ✓ deleted ${demoProjectIds.length} demo projects`);
    }
    if (demoUserIds.length) {
      await db.delete(users).where(inArray(users.id, demoUserIds));
      console.log(`   ✓ deleted ${demoUserIds.length} demo members`);
    }
  }

  // 2. members — onConflictDoNothing on email (safe re-run)
  console.log("→ inserting demo members…");
  for (const m of MEMBERS) {
    await db.insert(users).values({ name: m.name, email: m.email, role: m.role }).onConflictDoNothing({
      target: users.email,
    });
  }
  const userRows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(like(users.email, `%@${DEMO_DOMAIN}`));
  const userByEmail = new Map(userRows.map((r) => [r.email, r]));
  console.log(`   ✓ ${userRows.length} demo members present`);

  // 3. projects — onConflictDoNothing on slug
  console.log("→ inserting demo projects…");
  for (const p of PROJECTS) {
    await db
      .insert(projects)
      .values({
        slug: p.slug,
        name: p.name,
        color: p.color,
        description: p.description,
      })
      .onConflictDoNothing({ target: projects.slug });
  }
  const projectRows = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name })
    .from(projects)
    .where(like(projects.slug, "demo-%"));
  const projectBySlug = new Map(projectRows.map((r) => [r.slug, r]));
  console.log(`   ✓ ${projectRows.length} demo projects present`);

  // 4. tasks — only insert if there are no tasks on demo projects yet
  // (avoids dup'ing on naive re-run; pass --reset to refresh)
  const existingTaskCount = projectRows.length
    ? (
        await db
          .select({ c: sql<number>`count(*)::int` })
          .from(tasks)
          .where(inArray(tasks.projectId, projectRows.map((p) => p.id)))
      )[0]?.c ?? 0
    : 0;

  if (existingTaskCount > 0 && !reset) {
    console.log(`   (skipping tasks — ${existingTaskCount} already present on demo projects; pass --reset to refresh)`);
    await closeDb();
    return;
  }

  const now = new Date();
  const taskSeeds = buildTasks(now);

  // pick a default creator (first manager) for tasks without an explicit creatorEmail
  const defaultCreator =
    userByEmail.get(`priya.nair@${DEMO_DOMAIN}`) ??
    userByEmail.get(`sneha.reddy@${DEMO_DOMAIN}`) ??
    userRows[0];
  if (!defaultCreator) throw new Error("no demo member found to use as default creator");

  console.log(`→ inserting ${taskSeeds.length} demo tasks…`);
  let i = 0;
  for (const t of taskSeeds) {
    const project = projectBySlug.get(t.projectSlug);
    if (!project) throw new Error(`project missing: ${t.projectSlug}`);
    const assignee = t.assigneeEmail ? userByEmail.get(t.assigneeEmail) ?? null : null;
    if (t.assigneeEmail && !assignee) {
      throw new Error(`assignee missing: ${t.assigneeEmail}`);
    }
    const creator = t.creatorEmail
      ? userByEmail.get(t.creatorEmail) ?? defaultCreator
      : defaultCreator;

    const createdAt = atIstHour(t.createdDaysAgo, hourFor(t.createdDaysAgo, i));
    const startedAt =
      t.status === "in_progress" || t.status === "review" || t.status === "done"
        ? atIstHour(t.startedDaysAgo ?? Math.max(0, t.createdDaysAgo - 1), hourFor(0, i + 1))
        : null;
    const completedAt =
      t.status === "done"
        ? atIstHour(t.completedDaysAgo ?? 0, hourFor(t.completedDaysAgo ?? 0, i + 2))
        : null;

    const [created] = await db
      .insert(tasks)
      .values({
        projectId: project.id,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        priority: t.priority,
        dueDate: t.due,
        assigneeId: assignee?.id ?? null,
        createdById: creator.id,
        createdAt,
        updatedAt: completedAt ?? startedAt ?? createdAt,
        startedAt,
        completedAt,
      })
      .returning({ id: tasks.id });

    if (created && t.comments?.length) {
      for (const c of t.comments) {
        const author = userByEmail.get(c.by);
        if (!author) continue;
        await db.insert(taskComments).values({
          taskId: created.id,
          authorId: author.id,
          body: c.body,
          createdAt: atIstHour(c.daysAgo, hourFor(c.daysAgo, i + 5)),
        });
      }
    }

    i++;
  }
  console.log(`   ✓ inserted ${taskSeeds.length} demo tasks (with comments)`);

  // 5. summary
  const totals = {
    members: userRows.length,
    projects: projectRows.length,
    tasks: taskSeeds.length,
    comments: taskSeeds.reduce((s, t) => s + (t.comments?.length ?? 0), 0),
  };
  console.log("");
  console.log("✓ demo seed complete");
  console.log(`   ${totals.members} members · ${totals.projects} projects · ${totals.tasks} tasks · ${totals.comments} comments`);
  console.log("");
  console.log("Cleanup: pnpm db:seed-demo -- --reset");

  await closeDb();
}

main().catch(async (e) => {
  console.error("seed-demo failed:", e);
  await closeDb().catch(() => {});
  process.exit(1);
});

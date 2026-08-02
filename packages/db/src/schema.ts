import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  date,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------- enums ----------

// productSlugEnum and the products/product_price_mappings/metrics_daily
// tables were removed 2026-05-22 when SeekPeak's scope narrowed to pure
// task management. The remaining razorpay-adjacent tables (customers,
// subscriptions, payments, razorpay_events) are kept and will be
// reframed as SaaS subscription billing for SeekPeak tenants when the
// billing flow is wired in. See migration 0019_drop_mis.sql.

export const planIntervalEnum = pgEnum("plan_interval", [
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "one_off",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "created",
  "authenticated",
  "active",
  "pending",
  "halted",
  "cancelled",
  "completed",
  "expired",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "created",
  "authorized",
  "captured",
  "refunded",
  "failed",
]);

export const eventProcessingStatusEnum = pgEnum("event_processing_status", [
  "pending",
  "processed",
  "failed",
  "skipped",
]);

// ---------- razorpay events (raw audit log) ----------

export const razorpayEvents = pgTable(
  "razorpay_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Razorpay's event id from the x-razorpay-event-id header or payload.id
    razorpayEventId: text("razorpay_event_id").unique(),
    eventType: text("event_type").notNull(), // e.g. payment.captured
    payload: jsonb("payload").notNull(),
    signature: text("signature"), // x-razorpay-signature header value
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processingStatus: eventProcessingStatusEnum("processing_status")
      .notNull()
      .default("pending"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processingError: text("processing_error"),
  },
  (t) => ({
    byType: index("rzp_events_type_idx").on(t.eventType, t.receivedAt),
    byStatus: index("rzp_events_status_idx").on(t.processingStatus),
  }),
);

// ---------- customers ----------

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    razorpayCustomerId: text("razorpay_customer_id").unique(),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEmail: index("customers_email_idx").on(t.email),
    byRzp: index("customers_rzp_idx").on(t.razorpayCustomerId),
  }),
);

// ---------- subscriptions ----------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    razorpaySubscriptionId: text("razorpay_subscription_id").notNull().unique(),
    razorpayPlanId: text("razorpay_plan_id"),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    status: subscriptionStatusEnum("status").notNull(),
    planAmountPaise: bigint("plan_amount_paise", { mode: "bigint" }).notNull(),
    interval: planIntervalEnum("interval"),
    currentStart: timestamp("current_start", { withTimezone: true }),
    currentEnd: timestamp("current_end", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCustomer: index("subs_customer_idx").on(t.customerId),
    byStatus: index("subs_status_idx").on(t.status),
  }),
);

// ---------- payments ----------

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    razorpayPaymentId: text("razorpay_payment_id").notNull().unique(),
    razorpayOrderId: text("razorpay_order_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    customerId: uuid("customer_id").references(() => customers.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    amountPaise: bigint("amount_paise", { mode: "bigint" }).notNull(),
    feePaise: bigint("fee_paise", { mode: "bigint" }),
    taxPaise: bigint("tax_paise", { mode: "bigint" }),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatusEnum("status").notNull(),
    method: text("method"), // card, upi, netbanking, wallet, emi, etc.
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    amountRefundedPaise: bigint("amount_refunded_paise", { mode: "bigint" }).default(sql`0`),
    mappingConfidence: numeric("mapping_confidence", { precision: 4, scale: 2 }),
    // 1.0 = exact amount match, 0.5 = within tolerance, 0.0 = unmapped
    /**
     * Where the row came from. Free-form text, conventional values:
     *   razorpay_webhook  — live webhook (default)
     *   razorpay_api      — /api/sync/razorpay or backfill script
     *   manual            — /admin/payments/new single-entry form
     *   csv_import        — /admin/payments/import bulk paste
     *   sheet_import      — one-shot import from bloomalgo.com / Data Zone
     * The Revenue dashboard shows a badge so manual entries are visible.
     */
    source: text("source").notNull().default("razorpay_webhook"),
    /** Who entered a manual payment — nullable for Razorpay-originated rows */
    enteredBy: text("entered_by"),
    raw: jsonb("raw"), // full payment object as last seen from Razorpay
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCaptured: index("payments_captured_idx").on(t.capturedAt),
    byCustomer: index("payments_customer_idx").on(t.customerId),
    byStatus: index("payments_status_idx").on(t.status),
    bySource: index("payments_source_idx").on(t.source),
  }),
);

// ============================================================================
// Tasks module — the primary SeekPeak product surface.
// Activity tracking (DeskTime-side) lives in the same Postgres so cross-
// module queries (time → task) are joinable without a service hop.
// ============================================================================

// ---------- enums (tasks + activity) ----------

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "manager",
  "member",
  "viewer",
  "agent", // first-class non-human user (AI agents, future)
]);

export const taskStatusEnum = pgEnum("task_status", [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
  "cancelled",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "med",
  "high",
  "urgent",
]);

export const taskDependencyKindEnum = pgEnum("task_dependency_kind", [
  "blocks",
  "relates_to",
]);

export const timeEntrySourceEnum = pgEnum("time_entry_source", [
  "manual",
  "agent",
]);

export const productivityEnum = pgEnum("productivity_class", [
  "productive",
  "neutral",
  "unproductive",
  "unclassified",
]);

export const agentOsEnum = pgEnum("agent_os", ["macos", "windows", "linux"]);

export const briefingKindEnum = pgEnum("briefing_kind", [
  "morning",
  "eod",
]);

export const projectSummaryKindEnum = pgEnum("project_summary_kind", [
  "health",
]);

export const dashboardPeriodEnum = pgEnum("dashboard_period", ["week", "month"]);

export const notificationKindEnum = pgEnum("notification_kind", [
  "mention",            // @-mentioned in a comment
  "assigned",           // someone assigned a task to you
  "task_completed",     // someone closed a task you created
  "comment_on_assigned",// someone else commented on a task you're assigned to
  "review_requested",   // task moved to "review" — notify managers/admins
  "review_approved",    // manager approved your task review
  "review_revision",    // manager requested revision on your task
  // Machine-raised, not person-raised: the content watchdog warning that a
  // post is due with no approver, has no copy, has stalled, or failed to
  // publish. A separate kind so the inbox never implies a human is asking.
  // The DB side is migration 0028 (ALTER TYPE ... ADD VALUE).
  "content_at_risk",
  // A manager changed your contribution standing. The body deliberately does
  // NOT carry the tier value — notifications are delivered by email, and a
  // standing is not something anyone should learn from an inbox. See 0030.
  "standing_updated",
]);

// ---------- users ----------
//
// First-class users for Skynet. Authenticated via Google SSO (truestock.in
// domain). Auto-provisioned on first sign-in; role defaults to "member" until
// an admin upgrades them. `agent` role is for non-human actors (future AI
// agents that participate in chat / write tasks / approve work).
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    googleSubject: text("google_subject").unique(), // Google `sub` claim
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("member"),
    phone: text("phone"),  // E.164 format e.g. +919876543210 — for WhatsApp
    // Personal off switch for messages OUTSIDE the app (migration 0029).
    // Deliberately not named per channel — the transport changed from WhatsApp
    // to email during development, and a column named after a transport would
    // have needed a migration to follow it. What the person is expressing is
    // "message me outside the app". Default on, but each transport's own
    // master switch is off, so nothing sends until one is turned on.
    notifyOutbound: boolean("notify_outbound").notNull().default(true),
    managerId: uuid("manager_id"),
    departmentId: uuid("department_id"),
    /** Product access list — array of product slugs OR ["*"] for all. JSONB
     *  rather than a separate join table because list is short and access is
     *  set per-user, not per-product. */
    productAccess: jsonb("product_access").notNull().default(sql`'["*"]'::jsonb`),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    hireDate: date("hire_date"),
    // ---- Contribution standing (migration 0030) ----
    // Manager-assigned, and visible ONLY to the person themselves, their
    // manager, and an admin. NEVER select these columns into anything a peer
    // can receive. lib/standing.ts is the single door — read through it rather
    // than reaching for the column, so the rule lives in one place instead of
    // being re-remembered correctly at every call site.
    //
    // Text + CHECK rather than a pgEnum: the vocabulary you use to describe
    // people is precisely the thing that gets revised, and Postgres cannot
    // drop or rename an enum value without a table rewrite.
    contributionTier: text("contribution_tier"),
    /** Why. The action refuses to set a tier without one. */
    contributionTierNote: text("contribution_tier_note"),
    contributionTierSetBy: uuid("contribution_tier_set_by"),
    contributionTierSetAt: timestamp("contribution_tier_set_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEmail: index("users_email_idx").on(t.email),
    byManager: index("users_manager_idx").on(t.managerId),
    byActive: index("users_active_idx").on(t.isActive),
    byDepartment: index("users_department_idx").on(t.departmentId),
  }),
);

// ---------- the office jukebox (migration 0031) ----------
//
// A shared queue driven from everyone's screen and played through one pair of
// speakers. See 0031_music.sql for why there is no `position` column (order is
// derived from votes, so a boost is one INSERT and can never disagree with the
// votes that produced it) and why there is no snapshot table (play_day makes
// the daily playlist a GROUP BY that cannot drift from what actually played).
export const musicTracks = pgTable(
  "music_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** YouTube video id, not a URL — the same video arrives in five link forms. */
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    channelTitle: text("channel_title"),
    /** Null when only oEmbed was available (no API key). The queue still works. */
    durationSeconds: integer("duration_seconds"),
    thumbnailUrl: text("thumbnail_url"),
    addedById: uuid("added_by_id"),
    /** queued | playing | played | skipped — CHECK-constrained in SQL. */
    status: text("status").notNull().default("queued"),
    playedAt: timestamp("played_at", { withTimezone: true }),
    /** The IST day it played. Null until it does. This IS the daily snapshot. */
    playDay: date("play_day"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCreated: index("music_tracks_queued_idx").on(t.createdAt),
    byDay: index("music_tracks_day_idx").on(t.playDay, t.playedAt),
  }),
);

// 'boost' raises a queued track; 'skip' votes to move on from what is playing
// right now. Deliberately two verbs rather than +1/-1 on one scale — see the
// migration for why an office does not need a way to downvote a colleague.
export const musicVotes = pgTable(
  "music_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => musicTracks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One vote of each kind per person per track. This uniqueness IS the
    // anti-abuse story — no rate limits, no counters to reconcile.
    uniqueVote: uniqueIndex("music_votes_unique_idx").on(t.trackId, t.userId, t.kind),
    byTrack: index("music_votes_track_idx").on(t.trackId, t.kind),
  }),
);

/** One row, id 'office'. Lets the queue tell "nothing playing" from "no speaker". */
export const musicPlayerState = pgTable("music_player_state", {
  id: text("id").primaryKey().default("office"),
  lastBeatAt: timestamp("last_beat_at", { withTimezone: true }),
  hostUserId: uuid("host_user_id"),
  isPaused: boolean("is_paused").notNull().default(false),
  // Where the track actually is, reported by the speaker's heartbeat (0032).
  // Null when nothing is connected — a progress bar reading 0:00 would be a
  // confident lie about a track that might be halfway through.
  positionSeconds: integer("position_seconds"),
  durationSeconds: integer("duration_seconds"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------- contribution_tier_history ----------
//
// Every change to a person's standing, including the one that cleared it.
//
// It exists so a standing has a memory. Without it there is only today's
// value: the person cannot see that it moved or why, a manager's judgement is
// ambient rather than attributable, and a standing that drifts down over six
// months looks identical to one set once and left alone.
//
// Same visibility rule as the columns — the person, their manager, an admin.
export const contributionTierHistory = pgTable(
  "contribution_tier_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null is meaningful here: it records the standing being cleared. */
    tier: text("tier"),
    note: text("note"),
    setById: uuid("set_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("contribution_tier_history_user_idx").on(t.userId, t.createdAt),
  }),
);

// ---------- departments ----------
//
// Admin-managed organizational units. Each user belongs to at most one
// department. A department can have a designated head (manager).
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    color: text("color"), // hex for badges
    headId: uuid("head_id"), // FK to users — the department manager
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byName: uniqueIndex("departments_name_uq").on(t.name),
  }),
);

// ---------- projects ----------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    color: text("color"), // hex
    iconUrl: text("icon_url"), // relative path e.g. /icons/my-project.png
    bannerUrl: text("banner_url"), // relative path e.g. /banners/my-project.webp
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySlug: uniqueIndex("projects_slug_uq").on(t.slug),
    byOwner: index("projects_owner_idx").on(t.ownerId),
    byArchived: index("projects_archived_idx").on(t.archivedAt),
  }),
);

// ---------- tasks ----------
//
// Subtasks are modelled via parent_task_id self-ref (one level recommended,
// arbitrary nesting allowed). order_index is a sparse integer used by the
// kanban board and list view for manual ordering — gap-100 strategy
// (initial values 1000, 2000, 3000) so inserts between rarely renumber.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("med"),
    dueDate: date("due_date"),
    dueTime: text("due_time"),          // "HH:MM" — only used on subtasks
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    parentTaskId: uuid("parent_task_id"),
    orderIndex: integer("order_index").notNull().default(1000),
    // Recurrence — see migration 0018. 'none' for one-off tasks (the
    // default); 'daily'/'weekly'/'monthly' for repeats. When a recurring
    // task is marked done, the server action spawns the next cycle and
    // links it back via recurrenceParentId so the audit trail survives.
    recurrence: text("recurrence", { enum: ["none", "daily", "weekly", "monthly"] })
      .notNull()
      .default("none"),
    recurrenceParentId: uuid("recurrence_parent_id"),
    // ---- content pipeline (migration 0022) ----
    // A task becomes a content item the moment contentChannel is set. Content
    // lives on `tasks` rather than a separate table so it inherits assignee,
    // comments, attachments, links, the approval flow, notifications and the
    // permission model for free.
    //   contentChannel — instagram | linkedin | youtube | x | reddit |
    //                    facebook | tiktok | email | google_ads | webinar | blog
    //   contentStage   — idea → script → design → review → scheduled → published
    //   publishAt      — when it goes LIVE (distinct from dueDate, which is
    //                    when the work is due)
    /** Whose growth this task is for (0034). Usually the assignee, but named
     *  separately so reassigning the work doesn't move it to someone else's
     *  rating page. Null for ordinary tasks. */
    improvementFor: uuid("improvement_for"),
    contentChannel: text("content_channel"),
    contentStage: text("content_stage"),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    // ---- approval gate (migration 0023) ----
    // Named approver on record before anything can be scheduled/published.
    // For SEBI-regulated financial promotions this is a compliance record,
    // so it lives in queryable columns rather than only in the comment feed.
    // complianceChecked is a separate signal: approval = "the content is
    // right"; compliance = "required disclaimers/registration details are
    // present".
    contentApprovedById: uuid("content_approved_by_id").references(() => users.id),
    contentApprovedAt: timestamp("content_approved_at", { withTimezone: true }),
    complianceChecked: boolean("compliance_checked").notNull().default(false),
    // ---- publishing handoff (migration 0024) ----
    // publishState is a SEPARATE state machine from contentStage on purpose:
    // contentStage tracks where the work is, publishState tracks what the
    // publisher did. A failed post must not rewrite editorial history.
    publishState: text("publish_state").notNull().default("idle"),
    publishedUrl: text("published_url"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishRef: text("publish_ref"),
    publishError: text("publish_error"),
    publishProfile: text("publish_profile"),
    // ---- per-network variants (migration 0027) ----
    // Variants of one idea share a postGroupId. They are PEERS, not subtasks:
    // each has its own channel, caption, slot, approval and publish state,
    // because Instagram's version can be live while LinkedIn's is still in
    // review. parentTaskId deliberately NOT reused — that means "subtask".
    postGroupId: uuid("post_group_id"),
    // ---- post composer (migration 0026) ----
    // postCaption is WHAT GOES OUT; description stays internal context. Before
    // this split, the publisher shipped the description verbatim and sliced it
    // at 2200 chars for every channel — destroying X posts and leaking
    // internal notes into public captions.
    postCaption: text("post_caption"),
    /** Hashtags/links, posted as the first comment (standard on Instagram). */
    postFirstComment: text("post_first_comment"),
    /** education | market_update | product | brand | promotion | community */
    contentPillar: text("content_pillar"),
    // ---- campaigns / media planning (migration 0025) ----
    // A task has one PROJECT (which product) and at most one CAMPAIGN (which
    // push). They're orthogonal — a Diwali campaign spans several products.
    // budgetPaise is the PLANNED spend for this line item; the campaign's
    // budget is the envelope it has to fit inside. Money is bigint paise,
    // never float.
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    budgetPaise: bigint("budget_paise", { mode: "bigint" }).notNull().default(sql`0`),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byProject: index("tasks_project_idx").on(t.projectId, t.status),
    byAssignee: index("tasks_assignee_idx").on(t.assigneeId, t.status),
    byParent: index("tasks_parent_idx").on(t.parentTaskId),
    byDue: index("tasks_due_idx").on(t.dueDate),
    byOrder: index("tasks_order_idx").on(t.projectId, t.status, t.orderIndex),
    byPublish: index("tasks_publish_idx").on(t.publishAt),
    byCampaign: index("tasks_campaign_idx").on(t.campaignId),
    byPillar: index("tasks_pillar_idx").on(t.contentPillar),
    byPostGroup: index("tasks_post_group_idx").on(t.postGroupId),
  }),
);

// ---------- task comments ----------

// ---------- campaigns (digital media planning) ----------
// The unit a marketing team actually plans in. Spans channels, weeks and a
// budget, and cuts across products — which is exactly why it is not a project.
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    objective: text("objective"),
    /** planning | live | done | cancelled (CHECK constraint, not an enum —
     *  adding an enum value takes a lock and this list will grow). */
    status: text("status").notNull().default("planning"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    /** Total envelope, in paise. Line-item budgets are summed against it. */
    budgetPaise: bigint("budget_paise", { mode: "bigint" }).notNull().default(sql`0`),
    ownerId: uuid("owner_id").references(() => users.id),
    /** Optional: campaigns that belong to one product can say so. */
    projectId: uuid("project_id").references(() => projects.id),
    color: text("color"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStatus: index("campaigns_status_idx").on(t.status),
    byOwner: index("campaigns_owner_idx").on(t.ownerId),
    byArchived: index("campaigns_archived_idx").on(t.archivedAt),
  }),
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(), // markdown
    kind: text("kind"), // null = normal comment; "review_approve" | "review_revise" for review feedback
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: index("task_comments_task_idx").on(t.taskId, t.createdAt),
    byAuthor: index("task_comments_author_idx").on(t.authorId),
  }),
);

// ---------- task attachments ----------
// Stored in DO Spaces (S3-compatible). For v1 we may use Postgres bytea fallback
// while attachment volume is low; spaces_key is the source of truth either way.
export const taskAttachments = pgTable(
  "task_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    mime: text("mime"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    spacesKey: text("spaces_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: index("task_attachments_task_idx").on(t.taskId),
  }),
);

// ---------- task links ----------
//
// External URLs attached to a task: the Figma file for a design task, the
// finished asset, the live/published URL for a post or ad. Modelled as rows
// (not three columns on tasks) because content work routinely has several —
// e.g. one script doc, three creatives, and a published link per channel.
// This is the foundation the content pipeline builds on.

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    // figma | asset | live | doc | other
    kind: text("kind").notNull().default("other"),
    url: text("url").notNull(),
    label: text("label"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byTask: index("task_links_task_idx").on(t.taskId),
  }),
);

// ---------- task dependencies ----------

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: taskDependencyKindEnum("kind").notNull().default("blocks"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pairUq: uniqueIndex("task_deps_pair_uq").on(t.taskId, t.dependsOnTaskId),
    byTask: index("task_deps_task_idx").on(t.taskId),
    byDep: index("task_deps_dep_idx").on(t.dependsOnTaskId),
  }),
);

// ---------- time entries (manual + agent-derived) ----------
//
// Single fact table for "user X spent Y minutes on task Z between A and B".
// `source = manual` for typed entries on a task page; `source = agent`
// for entries created by activity_sessions roll-up. Task is nullable —
// time without a task is "unattributed" / general work.
export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    source: timeEntrySourceEnum("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    minutes: integer("minutes").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserStart: index("time_entries_user_start_idx").on(t.userId, t.startedAt),
    byTask: index("time_entries_task_idx").on(t.taskId),
    bySource: index("time_entries_source_idx").on(t.source),
  }),
);

// ---------- activity sessions (raw agent reports) ----------
//
// Raw 60-second buckets reported by the Mac agent. Roll-up into time_entries
// happens via a scheduled job (cron). Window titles are nullable + privacy-
// gated; the agent can be configured to send "names only" mode that omits
// titles entirely.
export const activitySessions = pgTable(
  "activity_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").references(() => agentDevices.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    appName: text("app_name").notNull(),
    windowTitle: text("window_title"),
    idleMinutes: integer("idle_minutes").notNull().default(0),
    productivity: productivityEnum("productivity").notNull().default("unclassified"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserStart: index("activity_sessions_user_start_idx").on(t.userId, t.startedAt),
    byApp: index("activity_sessions_app_idx").on(t.appName),
    byTask: index("activity_sessions_task_idx").on(t.taskId),
  }),
);

// ---------- app classifications (productivity tagging rules) ----------
//
// Optional productivity labels for app names. Per-user rows override the
// org-default rows (where user_id is null). Lets a manager mark
// "VS Code = productive" once for the whole org, while a designer can
// override "Figma = productive" for themselves.
export const appClassifications = pgTable(
  "app_classifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    appNamePattern: text("app_name_pattern").notNull(), // exact match for v1, glob later
    productivity: productivityEnum("productivity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserApp: uniqueIndex("app_class_user_app_uq").on(t.userId, t.appNamePattern),
    byApp: index("app_class_app_idx").on(t.appNamePattern),
  }),
);

// ---------- agent devices ----------

export const agentDevices = pgTable(
  "agent_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    os: agentOsEnum("os").notNull(),
    agentVersion: text("agent_version"),
    /** SHA-256 of the install token. Token shown to user once at install,
     *  hashed at rest. Used by the agent's bearer auth. */
    installTokenHash: text("install_token_hash").notNull().unique(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("agent_devices_user_idx").on(t.userId),
    byTokenHash: index("agent_devices_token_idx").on(t.installTokenHash),
  }),
);

// ---------- relations ----------

export const customersRelations = relations(customers, ({ many }) => ({
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  customer: one(customers, {
    fields: [subscriptions.customerId],
    references: [customers.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ---------- relations for tasks module ----------

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  head: one(users, {
    fields: [departments.headId],
    references: [users.id],
    relationName: "departmentHead",
  }),
  members: many(users, { relationName: "department" }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager",
  }),
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
    relationName: "department",
  }),
  reports: many(users, { relationName: "manager" }),
  ownedProjects: many(projects),
  assignedTasks: many(tasks, { relationName: "assignee" }),
  createdTasks: many(tasks, { relationName: "creator" }),
  comments: many(taskComments),
  attachments: many(taskAttachments),
  timeEntries: many(timeEntries),
  activitySessions: many(activitySessions),
  appClassifications: many(appClassifications),
  agentDevices: many(agentDevices),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "assignee",
  }),
  createdBy: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
    relationName: "creator",
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "parent",
  }),
  subtasks: many(tasks, { relationName: "parent" }),
  comments: many(taskComments),
  attachments: many(taskAttachments),
  dependencies: many(taskDependencies, { relationName: "task" }),
  dependents: many(taskDependencies, { relationName: "dependsOn" }),
  timeEntries: many(timeEntries),
  activitySessions: many(activitySessions),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  author: one(users, {
    fields: [taskComments.authorId],
    references: [users.id],
  }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
  uploader: one(users, {
    fields: [taskAttachments.uploaderId],
    references: [users.id],
  }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: "task",
  }),
  dependsOn: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: "dependsOn",
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, {
    fields: [timeEntries.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [timeEntries.taskId],
    references: [tasks.id],
  }),
}));

export const activitySessionsRelations = relations(activitySessions, ({ one }) => ({
  user: one(users, {
    fields: [activitySessions.userId],
    references: [users.id],
  }),
  device: one(agentDevices, {
    fields: [activitySessions.deviceId],
    references: [agentDevices.id],
  }),
  task: one(tasks, {
    fields: [activitySessions.taskId],
    references: [tasks.id],
  }),
}));

export const appClassificationsRelations = relations(appClassifications, ({ one }) => ({
  user: one(users, {
    fields: [appClassifications.userId],
    references: [users.id],
  }),
}));

export const agentDevicesRelations = relations(agentDevices, ({ one, many }) => ({
  user: one(users, {
    fields: [agentDevices.userId],
    references: [users.id],
  }),
  sessions: many(activitySessions),
}));

// ---------- notifications ----------
//
// In-app inbox for each user. Created by server actions in apps/web when:
//   • addComment sees an @firstname token       → kind = "mention"
//   • assignTask sets a new assignee            → kind = "assigned"
//   • updateTaskStatus flips status to "done"   → kind = "task_completed" → creator
//   • addComment posts to a task with an
//     assignee other than the author            → kind = "comment_on_assigned"
//
// `read_at` IS NULL means unread. Marking read is a simple update.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** When this actually left the building (WhatsApp). Null = never sent. */
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserCreated: index("notifications_user_created_idx").on(t.userId, t.createdAt),
    byUserUnread: index("notifications_user_unread_idx")
      .on(t.userId, t.createdAt)
      .where(sql`read_at is null`),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notification_user",
  }),
  task: one(tasks, {
    fields: [notifications.taskId],
    references: [tasks.id],
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: "notification_actor",
  }),
}));

// ---------- daily_briefings ----------
//
// Per-user AI briefings, cached per (user_id, date, kind). Generated on
// first request that day; refreshed manually via a Refresh button. Body is
// the rendered text from qwen3:8b. Keep one row per (user, date, kind);
// regenerate updates body + generated_at.
export const dailyBriefings = pgTable(
  "daily_briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: briefingKindEnum("kind").notNull(),
    body: text("body").notNull(),
    model: text("model"),
    durationMs: integer("duration_ms"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex("daily_briefings_uq").on(t.userId, t.date, t.kind),
    byUser: index("daily_briefings_user_idx").on(t.userId, t.date),
  }),
);

// ---------- project_summaries ----------
//
// Cached AI-written health summary per (project_id, date). Refreshable via
// a Refresh button on /projects/[slug].
export const projectSummaries = pgTable(
  "project_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: projectSummaryKindEnum("kind").notNull().default("health"),
    body: text("body").notNull(),
    model: text("model"),
    durationMs: integer("duration_ms"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex("project_summaries_uq").on(t.projectId, t.date, t.kind),
  }),
);

// ---------- ai_dashboards ----------
//
// Cached weekly + monthly personal insight dashboards. The bento page
// renders entirely from `body_json` (the pre-computed stat snapshot) and
// `narrative` (the AI commentary), so the page itself is just rendering.
// Refresh button overwrites the row for the same (user, period, period_key).
//
// period_key: ISO week "2026-W19" or year-month "2026-05".
export const aiDashboards = pgTable(
  "ai_dashboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    period: dashboardPeriodEnum("period").notNull(),
    periodKey: text("period_key").notNull(),
    bodyJson: jsonb("body_json").notNull(),
    narrative: text("narrative"),
    model: text("model"),
    durationMs: integer("duration_ms"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex("ai_dashboards_uq").on(t.userId, t.period, t.periodKey),
    byUser: index("ai_dashboards_user_idx").on(t.userId, t.generatedAt),
  }),
);

// ---------- daily_reviews ----------
//
// Pre-generated AI review snippets. One personal row per user per date,
// plus one team summary row (userId = null). Generated at 9 AM IST by cron;
// displayed as a hero card on the Today page.
export const dailyReviews = pgTable(
  "daily_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    tone: text("tone").notNull(),
    body: text("body").notNull(),
    stats: jsonb("stats"), // raw PersonStats snapshot
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserDate: uniqueIndex("daily_reviews_user_date_uq").on(t.userId, t.date),
    byDate: index("daily_reviews_date_idx").on(t.date),
  }),
);

export const dailyReviewsRelations = relations(dailyReviews, ({ one }) => ({
  user: one(users, {
    fields: [dailyReviews.userId],
    references: [users.id],
  }),
}));

// ---------- ai_knowledge_digests ----------
//
// Nightly snapshots of project/team context so every AI call
// (triage, clarity, reviews) has institutional memory.
export const aiKnowledgeDigests = pgTable(
  "ai_knowledge_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    scope: text("scope").notNull().default("global"), // 'global' or project slug
    digest: jsonb("digest").notNull(),
    summary: text("summary"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    durationMs: integer("duration_ms"),
    provider: text("provider"),
    model: text("model"),
  },
  (t) => ({
    uqDateScope: uniqueIndex("uq_digest_date_scope").on(t.date, t.scope),
    byDate: index("idx_digest_date").on(t.date),
    byScope: index("idx_digest_scope").on(t.scope, t.date),
  }),
);

// ---------- user_badges ----------
//
// Achievement badges earned by users. One row per user per badge.
// Badge definitions live in app code (lib/badges.ts), not in the DB.
export const userBadges = pgTable(
  "user_badges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).defaultNow().notNull(),
    meta: jsonb("meta"), // context like { taskId, projectSlug, count }
  },
  (t) => ({
    uqUserBadge: uniqueIndex("uq_user_badge").on(t.userId, t.badgeKey),
    byUser: index("idx_badges_user").on(t.userId, t.awardedAt),
    byKey: index("idx_badges_key").on(t.badgeKey),
  }),
);

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, {
    fields: [userBadges.userId],
    references: [users.id],
  }),
}));

// ---------- types ----------

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type RazorpayEvent = typeof razorpayEvents.$inferSelect;
export type NewRazorpayEvent = typeof razorpayEvents.$inferInsert;

// Tasks module types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type NewTaskComment = typeof taskComments.$inferInsert;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type NewTaskAttachment = typeof taskAttachments.$inferInsert;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type NewTaskDependency = typeof taskDependencies.$inferInsert;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;
export type ActivitySession = typeof activitySessions.$inferSelect;
export type NewActivitySession = typeof activitySessions.$inferInsert;
export type AppClassification = typeof appClassifications.$inferSelect;
export type NewAppClassification = typeof appClassifications.$inferInsert;
export type AgentDevice = typeof agentDevices.$inferSelect;
export type NewAgentDevice = typeof agentDevices.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type DailyBriefing = typeof dailyBriefings.$inferSelect;
export type NewDailyBriefing = typeof dailyBriefings.$inferInsert;
export type ProjectSummary = typeof projectSummaries.$inferSelect;
export type NewProjectSummary = typeof projectSummaries.$inferInsert;
export type AiDashboard = typeof aiDashboards.$inferSelect;
export type NewAiDashboard = typeof aiDashboards.$inferInsert;
export type DailyReview = typeof dailyReviews.$inferSelect;
export type NewDailyReview = typeof dailyReviews.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;
export type NewUserBadge = typeof userBadges.$inferInsert;
export type AiKnowledgeDigest = typeof aiKnowledgeDigests.$inferSelect;
export type NewAiKnowledgeDigest = typeof aiKnowledgeDigests.$inferInsert;

// ---------- yearly reviews ----------

export const reviewCycleStatusEnum = pgEnum("review_cycle_status", [
  "draft",    // admin is still setting it up
  "open",     // members can fill their forms
  "closed",   // deadline passed, no more edits
]);

export const reviewResponseStatusEnum = pgEnum("review_response_status", [
  "pending",    // not started
  "in_progress", // saved but not submitted
  "submitted",  // member clicked submit
]);

/** A review cycle — typically one per financial year. */
export const reviewCycles = pgTable("review_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),             // e.g. "FY 2025-26 Yearly Review"
  fyStart: date("fy_start").notNull(),      // e.g. 2025-04-01
  fyEnd: date("fy_end").notNull(),          // e.g. 2026-03-31
  deadline: timestamp("deadline", { withTimezone: true }), // when the form closes
  status: reviewCycleStatusEnum("status").notNull().default("draft"),
  createdById: uuid("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Fixed set of questions for a cycle (order matters). */
export const reviewQuestions = pgTable(
  "review_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id").notNull().references(() => reviewCycles.id, { onDelete: "cascade" }),
    orderIndex: integer("order_index").notNull().default(0),
    questionText: text("question_text").notNull(),
    helpText: text("help_text"),            // optional guidance shown below the question
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCycle: index("review_questions_cycle_idx").on(t.cycleId, t.orderIndex),
  }),
);

/** One response row per member per cycle. Answers stored as JSONB keyed by questionId. */
export const reviewResponses = pgTable(
  "review_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cycleId: uuid("cycle_id").notNull().references(() => reviewCycles.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    status: reviewResponseStatusEnum("status").notNull().default("pending"),
    /** { [questionId]: "answer text" } */
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniquePerCycle: uniqueIndex("review_responses_cycle_user_idx").on(t.cycleId, t.userId),
    byUser: index("review_responses_user_idx").on(t.userId),
  }),
);

// Relations
export const reviewCyclesRelations = relations(reviewCycles, ({ one, many }) => ({
  createdBy: one(users, { fields: [reviewCycles.createdById], references: [users.id] }),
  questions: many(reviewQuestions),
  responses: many(reviewResponses),
}));

export const reviewQuestionsRelations = relations(reviewQuestions, ({ one }) => ({
  cycle: one(reviewCycles, { fields: [reviewQuestions.cycleId], references: [reviewCycles.id] }),
}));

export const reviewResponsesRelations = relations(reviewResponses, ({ one }) => ({
  cycle: one(reviewCycles, { fields: [reviewResponses.cycleId], references: [reviewCycles.id] }),
  user: one(users, { fields: [reviewResponses.userId], references: [users.id] }),
}));

// ---------- review attachments ----------
// PDFs, presentations, or supporting documents attached to a review response.
export const reviewAttachments = pgTable(
  "review_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => reviewResponses.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    filename: text("filename").notNull(),
    mime: text("mime"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
    spacesKey: text("spaces_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byResponse: index("review_attachments_response_idx").on(t.responseId),
  }),
);

export const reviewAttachmentsRelations = relations(reviewAttachments, ({ one }) => ({
  response: one(reviewResponses, {
    fields: [reviewAttachments.responseId],
    references: [reviewResponses.id],
  }),
  uploader: one(users, {
    fields: [reviewAttachments.uploaderId],
    references: [users.id],
  }),
}));

// Types
export type ReviewCycle = typeof reviewCycles.$inferSelect;
export type NewReviewCycle = typeof reviewCycles.$inferInsert;
export type ReviewQuestion = typeof reviewQuestions.$inferSelect;
export type NewReviewQuestion = typeof reviewQuestions.$inferInsert;
export type ReviewResponse = typeof reviewResponses.$inferSelect;
export type NewReviewResponse = typeof reviewResponses.$inferInsert;
export type ReviewAttachment = typeof reviewAttachments.$inferSelect;
export type NewReviewAttachment = typeof reviewAttachments.$inferInsert;

// ---------- chat ----------

export const chatChannelTypeEnum = pgEnum("chat_channel_type", ["dm", "group"]);

export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  type: chatChannelTypeEnum("type").notNull().default("group"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatChannelMembers = pgTable(
  "chat_channel_members",
  {
    channelId: uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.channelId, t.userId] }),
    byUser: index("chat_channel_members_user_idx").on(t.userId),
  }),
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byChannel: index("chat_messages_channel_idx").on(t.channelId, t.createdAt),
    bySender: index("chat_messages_sender_idx").on(t.senderId),
  }),
);

export const chatChannelsRelations = relations(chatChannels, ({ one, many }) => ({
  createdBy: one(users, { fields: [chatChannels.createdById], references: [users.id] }),
  members: many(chatChannelMembers),
  messages: many(chatMessages),
}));

export const chatChannelMembersRelations = relations(chatChannelMembers, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatChannelMembers.channelId], references: [chatChannels.id] }),
  user: one(users, { fields: [chatChannelMembers.userId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  channel: one(chatChannels, { fields: [chatMessages.channelId], references: [chatChannels.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

export type ChatChannel = typeof chatChannels.$inferSelect;
export type NewChatChannel = typeof chatChannels.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

// ---------- org_settings ----------
//
// Single-row table storing workspace-wide organisation settings.
// Only admins can read/write.
export const orgSettings = pgTable("org_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull().default("My Organisation"),
  logoUrl: text("logo_url"),
  domain: text("domain"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  workingHoursStart: text("working_hours_start").notNull().default("09:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("18:00"),
  workingDays: jsonb("working_days").notNull().$type<number[]>().default([1, 2, 3, 4, 5]),
  defaultRole: text("default_role").notNull().default("member"),
  reviewCycleFrequency: text("review_cycle_frequency").notNull().default("quarterly"),
  notifyOnTaskAssign: boolean("notify_on_task_assign").notNull().default(true),
  notifyOnReviewStart: boolean("notify_on_review_start").notNull().default(true),
  notifyOnDueSoon: boolean("notify_on_due_soon").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type OrgSettings = typeof orgSettings.$inferSelect;
export type NewOrgSettings = typeof orgSettings.$inferInsert;

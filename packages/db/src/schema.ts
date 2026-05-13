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

export const productSlugEnum = pgEnum("product_slug", [
  "stock_bee",
  "high",
  "axe_cap",
  "bloom",
  "universe", // internal (for cross-cutting work tagging, not sold)
  "unknown", // unmapped — shows up in dashboards as a bucket to investigate
]);

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

// ---------- products ----------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: productSlugEnum("slug").notNull().unique(),
    name: text("name").notNull(),
    tagline: text("tagline"),
    color: text("color"), // hex, e.g. #F5B84A
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

// Product mappings.
//
// TWO lookup paths, in order of preference:
//   1. `plan_name_match` — exact Razorpay plan name (case-insensitive). Comes
//      from `subscription.plan.item.name` on subscription events. This is the
//      authoritative signal when present — plan names like
//      "FinX Bloom Rise(Monthly)" map unambiguously to a product even when
//      two products share an amount.
//   2. `amount_paise` — expected payment amount in paise (₹299 → 29900).
//      Fallback for one-off payments or older events that don't carry plan
//      context. ±tolerance covers GST rounding.
//
// A single mapping row can carry both signals (preferred), or just one.
export const productPriceMappings = pgTable(
  "product_price_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Razorpay plan name, exact string from subscription.plan.item.name.
     *  Compared case-insensitively. Nullable — some rows are amount-only. */
    planNameMatch: text("plan_name_match"),
    amountPaise: bigint("amount_paise", { mode: "bigint" }).notNull(),
    interval: planIntervalEnum("interval").notNull(),
    tolerancePaise: integer("tolerance_paise").notNull().default(100),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAmount: index("price_map_amount_idx").on(t.amountPaise, t.isActive),
    byProduct: index("price_map_product_idx").on(t.productId),
    byPlanName: index("price_map_plan_name_idx").on(t.planNameMatch, t.isActive),
  }),
);

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
    // primary product — set to first product they paid for, updatable
    primaryProductId: uuid("primary_product_id").references(() => products.id),
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
    productId: uuid("product_id").references(() => products.id),
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
    byProduct: index("subs_product_idx").on(t.productId, t.status),
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
    productId: uuid("product_id").references(() => products.id),
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
    byProductCaptured: index("payments_product_captured_idx").on(t.productId, t.capturedAt),
    byCustomer: index("payments_customer_idx").on(t.customerId),
    byStatus: index("payments_status_idx").on(t.status),
    bySource: index("payments_source_idx").on(t.source),
  }),
);

// ---------- metrics_daily (narrow fact table) ----------

// One row per (date, product_id or null for "all", metric_key).
// Feeds all MIS charts. Metric keys examples:
//   revenue_net_paise, revenue_gross_paise, refunds_paise,
//   new_subs, active_subs, cancelled_subs, payments_count, unique_customers
export const metricsDaily = pgTable(
  "metrics_daily",
  {
    date: date("date").notNull(),
    productId: uuid("product_id").references(() => products.id),
    metric: text("metric").notNull(),
    valueNumeric: numeric("value_numeric", { precision: 20, scale: 2 }),
    valueBigint: bigint("value_bigint", { mode: "bigint" }),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.productId, t.metric] }),
    byMetricDate: index("metrics_metric_date_idx").on(t.metric, t.date),
    byProductDate: index("metrics_product_date_idx").on(t.productId, t.date),
  }),
);

// ============================================================================
// Tasks module (Asana-side) + Activity tracking (DeskTime-side)
//
// Lives in same Postgres as MIS so cross-module queries (revenue → task,
// campaign → task) are joinable without a service hop. Per project policy:
// every project carries product_id (nullable for "internal cross-cutting").
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
    managerId: uuid("manager_id"),
    /** Product access list — array of product slugs OR ["*"] for all. JSONB
     *  rather than a separate join table because list is short and access is
     *  set per-user, not per-product. */
    productAccess: jsonb("product_access").notNull().default(sql`'["*"]'::jsonb`),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    hireDate: date("hire_date"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byEmail: index("users_email_idx").on(t.email),
    byManager: index("users_manager_idx").on(t.managerId),
    byActive: index("users_active_idx").on(t.isActive),
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
    productId: uuid("product_id").references(() => products.id),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    color: text("color"), // hex
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySlug: uniqueIndex("projects_slug_uq").on(t.slug),
    byProduct: index("projects_product_idx").on(t.productId),
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
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimatedMinutes: integer("estimated_minutes"),
    parentTaskId: uuid("parent_task_id"),
    orderIndex: integer("order_index").notNull().default(1000),
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
  }),
);

// ---------- task comments ----------

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

export const productsRelations = relations(products, ({ many }) => ({
  priceMappings: many(productPriceMappings),
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const priceMappingsRelations = relations(productPriceMappings, ({ one }) => ({
  product: one(products, {
    fields: [productPriceMappings.productId],
    references: [products.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  primaryProduct: one(products, {
    fields: [customers.primaryProductId],
    references: [products.id],
  }),
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  customer: one(customers, {
    fields: [subscriptions.customerId],
    references: [customers.id],
  }),
  product: one(products, {
    fields: [subscriptions.productId],
    references: [products.id],
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
  product: one(products, {
    fields: [payments.productId],
    references: [products.id],
  }),
}));

// ---------- relations for tasks module ----------

export const usersRelations = relations(users, ({ one, many }) => ({
  manager: one(users, {
    fields: [users.managerId],
    references: [users.id],
    relationName: "manager",
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
  product: one(products, {
    fields: [projects.productId],
    references: [products.id],
  }),
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

// ---------- types ----------

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type PriceMapping = typeof productPriceMappings.$inferSelect;
export type NewPriceMapping = typeof productPriceMappings.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type MetricDaily = typeof metricsDaily.$inferSelect;
export type NewMetricDaily = typeof metricsDaily.$inferInsert;
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

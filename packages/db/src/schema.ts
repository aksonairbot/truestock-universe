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
    amountRefundedPaise: bigint("amount_refunded_paise", { mode: "bigint" }).default(0n),
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

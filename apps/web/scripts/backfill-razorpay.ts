/**
 * Razorpay historical backfill.
 *
 * Pulls captured payments from Razorpay for a configurable window and pushes
 * each through the same processEvent() pipeline the webhook uses. Idempotent
 * via the unique razorpay_payment_id constraint — safe to re-run.
 *
 *   pnpm razorpay:backfill                    # last 90 days
 *   pnpm razorpay:backfill -- --since 2025-01-01
 *   pnpm razorpay:backfill -- --since 2025-01-01 --until 2025-06-30
 *   pnpm razorpay:backfill -- --dry-run       # fetch + report, don't write
 *
 * Run this once on day-1 after the DB is provisioned. For ongoing
 * reconciliation, use the /api/sync/razorpay cron endpoint instead.
 */
import { config } from "dotenv";
config({ path: "../../.env" });

import { getDb, closeDb } from "@tu/db";
import { fetchPaymentsSince, processEvent } from "@tu/razorpay";

type Args = {
  since: Date;
  until: Date;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a.startsWith("--") && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      args[a.slice(2)] = argv[i + 1]!;
      i++;
    }
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const since = args.since ? new Date(args.since as string) : ninetyDaysAgo;
  const until = args.until ? new Date(args.until as string) : new Date();

  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    console.error("invalid --since or --until — use YYYY-MM-DD or ISO 8601");
    process.exit(1);
  }
  if (since >= until) {
    console.error("--since must be earlier than --until");
    process.exit(1);
  }

  return { since, until, dryRun: Boolean(args.dryRun) };
}

async function main() {
  const { since, until, dryRun } = parseArgs(process.argv.slice(2));

  console.log("→ Razorpay backfill");
  console.log(`  window: ${since.toISOString()} → ${until.toISOString()}`);
  console.log(`  mode:   ${dryRun ? "DRY RUN (no writes)" : "LIVE (writes to DB)"}`);

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("✗ RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
    process.exit(1);
  }

  const started = Date.now();
  const payments = await fetchPaymentsSince({ from: since, to: until });
  console.log(`  fetched: ${payments.length} payments in ${Date.now() - started}ms`);

  if (payments.length === 0) {
    console.log("  nothing to process.");
    return;
  }

  const byStatus = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log("  status breakdown:", byStatus);

  if (dryRun) {
    console.log("  (dry-run) skipping DB writes");
    const totalPaise = payments
      .filter((p) => p.status === "captured")
      .reduce<bigint>((s, p) => s + BigInt(p.amount), BigInt(0));
    console.log(`  would process ₹${Number(totalPaise) / 100} across captured payments`);
    return;
  }

  const db = getDb();
  let processed = 0;
  let failed = 0;
  let progressAt = Date.now();

  for (const p of payments) {
    const result = await processEvent(db, {
      entity: "event",
      account_id: "backfill",
      event: `payment.${p.status}`,
      contains: ["payment"],
      payload: { payment: { entity: p } },
      created_at: p.created_at,
    });
    if (result.ok) processed++;
    else failed++;

    // Progress line every 5s
    if (Date.now() - progressAt > 5000) {
      console.log(`  progress: ${processed + failed}/${payments.length}  ok=${processed} fail=${failed}`);
      progressAt = Date.now();
    }
  }

  console.log("");
  console.log(`✓ backfill complete in ${Date.now() - started}ms`);
  console.log(`  processed: ${processed}   failed: ${failed}`);
  if (failed > 0) {
    console.log("  → inspect razorpay_events where processing_status='failed' for details");
  }

  await closeDb();
}

main().catch((e) => {
  console.error("backfill failed:", e);
  process.exit(1);
});

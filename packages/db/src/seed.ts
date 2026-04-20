/**
 * Seed products + product_price_mappings.
 *
 * Run with: pnpm db:seed   (from repo root)
 *
 * Safe to re-run — products are upserted by slug. Price mappings are only
 * inserted if the product has none yet; re-seed won't duplicate. Edit the
 * live mappings via `/admin/price-mappings`, not here.
 *
 * Prices reflect what was observed in the Apr 2026 TrueStock Data Zone
 * workbook. Stockbee + Bloom are live; High + Axe Cap are on the roadmap but
 * not yet selling via Razorpay — their product rows exist so everything else
 * (task tags, agent roles, etc.) works, but they have no active mappings.
 */
import { config } from "dotenv";
config({ path: "../../.env" });

import { getDb, products, productPriceMappings, closeDb } from "./index.js";
import { eq, sql } from "drizzle-orm";

type PriceSeed = {
  amountInr: number;
  interval: "monthly" | "quarterly" | "half_yearly" | "yearly" | "one_off";
  /** Razorpay plan name — set this wherever known so plan_name matching kicks in */
  planNameMatch?: string;
  tolerancePaise?: number;
  notes?: string;
  isActive?: boolean;
};

type ProductSeed = {
  slug:
    | "stock_bee"
    | "high"
    | "axe_cap"
    | "bloom"
    | "universe"
    | "unknown";
  name: string;
  tagline: string;
  color: string;
  prices: PriceSeed[];
};

const SEEDS: ProductSeed[] = [
  // ------------------------------------------------------------------------
  // Stockbee — live. Monthly tiers: Swift Pro (entry, ₹299), Turbo Edge
  // (mid, ₹999), Stock Bee Turbo (top, ₹3,999). New yearly plans at ₹2,000
  // and ₹6,999. Legacy ₹199 and ₹1,910 prices still observed in recurring
  // charges for grandfathered customers — kept active so they attribute
  // correctly; retire once those subscriptions churn.
  // ------------------------------------------------------------------------
  {
    slug: "stock_bee",
    name: "Stock Bee",
    tagline: "Retail-friendly stock screener & signals",
    color: "#F5B84A",
    prices: [
      { amountInr: 299, interval: "monthly", planNameMatch: "Swift Pro Plan(Monthly)",
        notes: "Swift Pro · current monthly" },
      { amountInr: 199, interval: "monthly", planNameMatch: "Swift Pro Plan(Monthly)",
        notes: "Swift Pro · legacy price (pre-2025 customers on old pricing)" },
      { amountInr: 999, interval: "monthly", planNameMatch: "Turbo Edge Plan(Monthly)",
        notes: "Turbo Edge · monthly" },
      { amountInr: 3999, interval: "monthly", planNameMatch: "Stock Bee Turbo(Monthly)",
        notes: "Stock Bee Turbo · monthly (top tier)" },
      { amountInr: 2000, interval: "yearly",
        notes: "Yearly plan A — new" },
      { amountInr: 6999, interval: "yearly",
        notes: "Yearly plan B — new" },
      { amountInr: 1910, interval: "monthly", planNameMatch: "Turbo Edge Plan(Monthly)",
        notes: "Turbo Edge · legacy price (Feb–May 2025)" },
    ],
  },

  // ------------------------------------------------------------------------
  // Bloom — live. Monthly tiers: Rise (₹1,999, dominant), Rise/Prime
  // (₹4,999), Elite (₹9,999). GST-inclusive ₹1,999.60 variant observed for
  // Rise. Legacy ₹999 (pre-Aug 2025) and ₹799.60 GST variant still appear
  // in recurring charges for grandfathered customers.
  // ------------------------------------------------------------------------
  {
    slug: "bloom",
    name: "Bloom",
    tagline: "Beginner-first mutual funds & goal planning",
    color: "#F472B6",
    prices: [
      { amountInr: 1999, interval: "monthly", planNameMatch: "FinX Bloom Rise(Monthly)",
        notes: "Bloom Rise · monthly (most common)" },
      { amountInr: 1999.60, interval: "monthly", planNameMatch: "FinX Bloom Rise(Monthly)",
        notes: "Bloom Rise · monthly · GST-inclusive variant" },
      { amountInr: 4999, interval: "monthly", planNameMatch: "Bloom Rise(Monthly)",
        notes: "Bloom Rise · monthly (higher tier — no 'FinX' prefix)" },
      { amountInr: 4999, interval: "monthly", planNameMatch: "FinX Bloom Prime(Monthly)",
        notes: "Bloom Prime · monthly" },
      { amountInr: 9999, interval: "monthly", planNameMatch: "FinX Bloom Elite(Monthly)",
        notes: "Bloom Elite · monthly (top)" },
      { amountInr: 999, interval: "monthly", planNameMatch: "FinX Bloom Rise(Monthly)",
        notes: "Bloom Rise · legacy ₹999 price (pre-Aug 2025)" },
      { amountInr: 799.60, interval: "monthly", planNameMatch: "FinX Bloom Rise(Monthly)",
        notes: "Bloom Rise · legacy GST-inclusive variant" },
    ],
  },

  // ------------------------------------------------------------------------
  // High — exists on roadmap, not yet selling via Razorpay. No mappings.
  // ------------------------------------------------------------------------
  {
    slug: "high",
    name: "High",
    tagline: "High-conviction portfolio advisory",
    color: "#4ADE80",
    prices: [],
  },

  // ------------------------------------------------------------------------
  // Axe Cap — exists on roadmap, not yet selling via Razorpay. No mappings.
  // ------------------------------------------------------------------------
  {
    slug: "axe_cap",
    name: "Axe Cap",
    tagline: "Pro derivatives & algo-trading cockpit",
    color: "#A78BFA",
    prices: [],
  },

  // ------------------------------------------------------------------------
  // Internal + sink buckets
  // ------------------------------------------------------------------------
  {
    slug: "universe",
    name: "Universe (internal)",
    tagline: "Internal Truestock Universe platform — not sold",
    color: "#7B5CFF",
    prices: [],
  },
  {
    slug: "unknown",
    name: "Unknown / needs mapping",
    tagline:
      "Bucket for payments whose plan name and amount didn't match any mapping",
    color: "#5A5F72",
    prices: [],
  },
];

async function main() {
  const db = getDb();
  console.log("→ seeding products…");

  for (const seed of SEEDS) {
    const [row] = await db
      .insert(products)
      .values({
        slug: seed.slug,
        name: seed.name,
        tagline: seed.tagline,
        color: seed.color,
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: seed.name,
          tagline: seed.tagline,
          color: seed.color,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) continue;
    console.log(`   ✓ ${row.slug.padEnd(10)} ${row.name}`);

    if (seed.prices.length === 0) {
      console.log(`     (no active mappings — not selling via Razorpay)`);
      continue;
    }

    const existing = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(productPriceMappings)
      .where(eq(productPriceMappings.productId, row.id));

    if ((existing[0]?.c ?? 0) > 0) {
      console.log(`     (keeping existing ${existing[0]!.c} mapping(s) — edit via /admin)`);
      continue;
    }

    await db.insert(productPriceMappings).values(
      seed.prices.map((p) => ({
        productId: row.id,
        planNameMatch: p.planNameMatch ?? null,
        amountPaise: BigInt(Math.round(p.amountInr * 100)),
        interval: p.interval,
        tolerancePaise: p.tolerancePaise ?? 100,
        notes: p.notes ?? null,
        isActive: p.isActive !== false,
      })),
    );

    for (const p of seed.prices) {
      const amt = `₹${p.amountInr.toString().padStart(7)}`;
      const int = p.interval.padEnd(10);
      const plan = p.planNameMatch ? `[${p.planNameMatch}]` : "[amount-only]";
      console.log(`     + ${amt}  ${int}  ${plan}`);
    }
  }

  console.log("✓ seeding complete");
  await closeDb();
}

main().catch((e) => {
  console.error("seed failed:", e);
  process.exit(1);
});

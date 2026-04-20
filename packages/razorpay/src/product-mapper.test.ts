import { describe, it, expect } from "vitest";
import {
  matchAmountToMapping,
  type AvailableMapping,
} from "./product-match.js";

const UNKNOWN = { id: "u-id", slug: "unknown" };

// Realistic mapping fixture based on actual Stockbee + Bloom data.
// Deliberately includes collisions:
//   - Stockbee Turbo Edge ₹999 vs Bloom Rise legacy ₹999
//   - Bloom Rise ₹4,999 vs Bloom Prime ₹4,999 (both real plans)
const SEED: AvailableMapping[] = [
  // Stockbee
  { id: "sb-1", productId: "p-bee", productSlug: "stock_bee", planNameMatch: "Swift Pro Plan(Monthly)", amountPaise: 29900n, tolerancePaise: 100 },
  { id: "sb-2", productId: "p-bee", productSlug: "stock_bee", planNameMatch: "Swift Pro Plan(Monthly)", amountPaise: 19900n, tolerancePaise: 100 },
  { id: "sb-3", productId: "p-bee", productSlug: "stock_bee", planNameMatch: "Turbo Edge Plan(Monthly)", amountPaise: 99900n, tolerancePaise: 100 },
  { id: "sb-4", productId: "p-bee", productSlug: "stock_bee", planNameMatch: "Stock Bee Turbo(Monthly)", amountPaise: 399900n, tolerancePaise: 100 },
  // Bloom
  { id: "bl-1", productId: "p-bloom", productSlug: "bloom", planNameMatch: "FinX Bloom Rise(Monthly)", amountPaise: 199900n, tolerancePaise: 100 },
  { id: "bl-2", productId: "p-bloom", productSlug: "bloom", planNameMatch: "FinX Bloom Rise(Monthly)", amountPaise: 199960n, tolerancePaise: 100 },
  { id: "bl-3", productId: "p-bloom", productSlug: "bloom", planNameMatch: "Bloom Rise(Monthly)", amountPaise: 499900n, tolerancePaise: 100 },
  { id: "bl-4", productId: "p-bloom", productSlug: "bloom", planNameMatch: "FinX Bloom Prime(Monthly)", amountPaise: 499900n, tolerancePaise: 100 },
  { id: "bl-5", productId: "p-bloom", productSlug: "bloom", planNameMatch: "FinX Bloom Elite(Monthly)", amountPaise: 999900n, tolerancePaise: 100 },
  { id: "bl-6", productId: "p-bloom", productSlug: "bloom", planNameMatch: "FinX Bloom Rise(Monthly)", amountPaise: 99900n, tolerancePaise: 100 },
];

describe("matchAmountToMapping — plan name primary", () => {
  it("matches by exact plan name (case-insensitive)", () => {
    const r = matchAmountToMapping(199900n, "FinX Bloom Rise(Monthly)", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("plan_name");
    expect(r.confidence).toBe(1.0);
    expect(r.productSlug).toBe("bloom");
  });

  it("is case-insensitive on plan name", () => {
    const r = matchAmountToMapping(199900n, "finx bloom rise(monthly)", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("plan_name");
    expect(r.productSlug).toBe("bloom");
  });

  it("trims whitespace on plan name", () => {
    const r = matchAmountToMapping(199900n, "  FinX Bloom Rise(Monthly)  ", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("plan_name");
    expect(r.productSlug).toBe("bloom");
  });

  it("disambiguates where amount alone would collide (₹4,999 = Rise OR Prime)", () => {
    const byPrime = matchAmountToMapping(499900n, "FinX Bloom Prime(Monthly)", SEED, UNKNOWN);
    expect(byPrime.matchedBy).toBe("plan_name");
    expect(byPrime.matchedMappingId).toBe("bl-4");

    const byRise = matchAmountToMapping(499900n, "Bloom Rise(Monthly)", SEED, UNKNOWN);
    expect(byRise.matchedBy).toBe("plan_name");
    expect(byRise.matchedMappingId).toBe("bl-3");
  });

  it("distinguishes 'Bloom Rise' from 'FinX Bloom Rise' by EXACT name", () => {
    // Without plan-name primary, these would collide on amount alone.
    const r = matchAmountToMapping(499900n, "Bloom Rise(Monthly)", SEED, UNKNOWN);
    expect(r.matchedMappingId).toBe("bl-3"); // not bl-4
  });

  it("flags candidates > 1 when a plan name has multiple price rows (₹1,999 + ₹1,999.60)", () => {
    const r = matchAmountToMapping(199900n, "FinX Bloom Rise(Monthly)", SEED, UNKNOWN);
    // Three rows match "FinX Bloom Rise(Monthly)": the ₹1,999, the ₹1,999.60 GST variant, and the legacy ₹999
    expect(r.candidates).toBe(3);
  });
});

describe("matchAmountToMapping — amount fallback", () => {
  it("falls back to exact amount match when no plan name given", () => {
    const r = matchAmountToMapping(29900n, null, SEED, UNKNOWN);
    expect(r.matchedBy).toBe("amount_exact");
    expect(r.productSlug).toBe("stock_bee");
    expect(r.matchedMappingId).toBe("sb-1");
  });

  it("falls back to exact amount when plan name is empty string", () => {
    const r = matchAmountToMapping(29900n, "", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("amount_exact");
  });

  it("returns candidates > 1 for ambiguous amounts without plan context", () => {
    // ₹4,999 matches both bl-3 (Bloom Rise) and bl-4 (Bloom Prime)
    const r = matchAmountToMapping(499900n, null, SEED, UNKNOWN);
    expect(r.matchedBy).toBe("amount_exact");
    expect(r.candidates).toBe(2);
  });

  it("fuzzy-matches within tolerance when exact fails", () => {
    // ₹1,999.49 → 49 paise off from bl-1 (₹1,999.00); within 100-paise tolerance
    const r = matchAmountToMapping(199949n, null, SEED, UNKNOWN);
    expect(r.matchedBy).toBe("amount_fuzzy");
    expect(r.productSlug).toBe("bloom");
    expect(r.confidence).toBe(0.5);
  });

  it("catches the ₹1,999.60 GST variant via exact match (tolerance not needed)", () => {
    const r = matchAmountToMapping(199960n, null, SEED, UNKNOWN);
    expect(r.matchedBy).toBe("amount_exact");
    expect(r.matchedMappingId).toBe("bl-2");
  });

  it("rejects amounts too far from any mapping", () => {
    const r = matchAmountToMapping(50000n, null, SEED, UNKNOWN);
    expect(r.matchedBy).toBe("unknown");
    expect(r.productSlug).toBe("unknown");
  });
});

describe("matchAmountToMapping — unknown fallback", () => {
  it("returns unknown bucket when nothing matches", () => {
    const r = matchAmountToMapping(123456n, "Some Plan We've Never Heard Of", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("unknown");
    expect(r.productId).toBe("u-id");
  });

  it("returns null product when there's no unknown bucket either", () => {
    const r = matchAmountToMapping(123456n, null, SEED, null);
    expect(r.matchedBy).toBe("unknown");
    expect(r.productSlug).toBeNull();
    expect(r.productId).toBeNull();
  });

  it("handles empty mappings list (cold start)", () => {
    const r = matchAmountToMapping(29900n, "Anything", [], UNKNOWN);
    expect(r.productSlug).toBe("unknown");
  });
});

describe("matchAmountToMapping — plan name beats ambiguous amount", () => {
  it("₹999 is Stockbee Turbo Edge AND legacy Bloom Rise — plan name picks the right one", () => {
    const bee = matchAmountToMapping(99900n, "Turbo Edge Plan(Monthly)", SEED, UNKNOWN);
    expect(bee.productSlug).toBe("stock_bee");
    expect(bee.matchedBy).toBe("plan_name");

    const bloom = matchAmountToMapping(99900n, "FinX Bloom Rise(Monthly)", SEED, UNKNOWN);
    expect(bloom.productSlug).toBe("bloom");
    expect(bloom.matchedBy).toBe("plan_name");
  });

  it("plan_name wins even when the amount doesn't match the mapping's amount", () => {
    // If Razorpay charges a prorated amount that doesn't equal the plan amount,
    // plan_name should still attribute it correctly.
    const r = matchAmountToMapping(150000n, "FinX Bloom Rise(Monthly)", SEED, UNKNOWN);
    expect(r.matchedBy).toBe("plan_name");
    expect(r.productSlug).toBe("bloom");
  });
});

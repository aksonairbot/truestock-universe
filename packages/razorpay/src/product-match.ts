/**
 * Pure product matching. No DB imports — trivially unit-testable.
 *
 * Matching strategy, in order:
 *   1. PLAN NAME — exact (case-insensitive, trimmed) match on Razorpay's
 *      `subscription.plan.item.name`. This is authoritative when present:
 *      plan names are unambiguous where amounts collide (e.g. ₹4,999 maps to
 *      three different Bloom plans). Returns confidence 1.0.
 *   2. EXACT AMOUNT — paise-equal. Returns 1.0 when a single mapping wins,
 *      flags candidates > 1 when the amount is ambiguous across products.
 *   3. FUZZY AMOUNT — within the mapping's tolerance_paise. Closest wins,
 *      confidence 0.5.
 *   4. UNKNOWN — fallback bucket.
 */

export type ProductMatch = {
  productId: string | null;
  productSlug: string | null;
  /** 1.0 = exact plan or amount match, 0.5 = fuzzy amount, 0.0 = unknown */
  confidence: number;
  /** What signal won the match — useful for debugging + dashboards */
  matchedBy: "plan_name" | "amount_exact" | "amount_fuzzy" | "unknown";
  matchedMappingId: string | null;
  /** More than 1 means the signal was ambiguous — caller should log/flag */
  candidates: number;
};

export type AvailableMapping = {
  id: string;
  productId: string;
  productSlug: string;
  planNameMatch: string | null;
  amountPaise: bigint;
  tolerancePaise: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export function matchAmountToMapping(
  amountPaise: bigint,
  planName: string | null | undefined,
  mappings: AvailableMapping[],
  unknown: { id: string; slug: string } | null,
): ProductMatch {
  // 1. plan name — primary signal
  const pn = norm(planName);
  if (pn) {
    const byPlan = mappings.filter((m) => m.planNameMatch && norm(m.planNameMatch) === pn);
    if (byPlan.length > 0) {
      return {
        productId: byPlan[0]!.productId,
        productSlug: byPlan[0]!.productSlug,
        confidence: 1.0,
        matchedBy: "plan_name",
        matchedMappingId: byPlan[0]!.id,
        candidates: byPlan.length,
      };
    }
  }

  // 2. exact amount
  const exact = mappings.filter((m) => m.amountPaise === amountPaise);
  if (exact.length > 0) {
    return {
      productId: exact[0]!.productId,
      productSlug: exact[0]!.productSlug,
      confidence: 1.0,
      matchedBy: "amount_exact",
      matchedMappingId: exact[0]!.id,
      candidates: exact.length,
    };
  }

  // 3. fuzzy amount
  const fuzzy = mappings.filter((m) => {
    const diff =
      m.amountPaise > amountPaise ? m.amountPaise - amountPaise : amountPaise - m.amountPaise;
    return diff <= BigInt(m.tolerancePaise);
  });

  if (fuzzy.length > 0) {
    const sorted = [...fuzzy].sort((a, b) => {
      const da = Number(
        a.amountPaise > amountPaise ? a.amountPaise - amountPaise : amountPaise - a.amountPaise,
      );
      const db = Number(
        b.amountPaise > amountPaise ? b.amountPaise - amountPaise : amountPaise - b.amountPaise,
      );
      return da - db;
    });
    return {
      productId: sorted[0]!.productId,
      productSlug: sorted[0]!.productSlug,
      confidence: 0.5,
      matchedBy: "amount_fuzzy",
      matchedMappingId: sorted[0]!.id,
      candidates: fuzzy.length,
    };
  }

  // 4. unknown
  return {
    productId: unknown?.id ?? null,
    productSlug: unknown?.slug ?? null,
    confidence: 0.0,
    matchedBy: "unknown",
    matchedMappingId: null,
    candidates: 0,
  };
}

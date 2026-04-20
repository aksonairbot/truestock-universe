import {
  type Database,
  productPriceMappings,
  products,
  eq,
} from "@tu/db";
import {
  matchAmountToMapping,
  type AvailableMapping,
  type ProductMatch,
} from "./product-match.js";

export { matchAmountToMapping } from "./product-match.js";
export type { ProductMatch, AvailableMapping } from "./product-match.js";

/**
 * DB-wrapping entrypoint used by the event processor. Loads all active
 * mappings once per call (fine at < 100 rows), then delegates to the pure
 * matcher in product-match.ts.
 *
 * `planName` is optional. Pass `subscription.plan.item.name` when
 * processing subscription events — it's the most reliable signal.
 */
export async function mapAmountToProduct(
  db: Database,
  amountPaise: bigint,
  planName?: string | null,
): Promise<ProductMatch> {
  const rows = await db
    .select({
      id: productPriceMappings.id,
      productId: products.id,
      productSlug: products.slug,
      planNameMatch: productPriceMappings.planNameMatch,
      amountPaise: productPriceMappings.amountPaise,
      tolerancePaise: productPriceMappings.tolerancePaise,
    })
    .from(productPriceMappings)
    .innerJoin(products, eq(products.id, productPriceMappings.productId))
    .where(eq(productPriceMappings.isActive, true));

  const [unknown] = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(eq(products.slug, "unknown"))
    .limit(1);

  const mappings: AvailableMapping[] = rows.map((r) => ({
    id: r.id,
    productId: r.productId,
    productSlug: r.productSlug as string,
    planNameMatch: r.planNameMatch ?? null,
    amountPaise: r.amountPaise,
    tolerancePaise: r.tolerancePaise,
  }));

  return matchAmountToMapping(
    amountPaise,
    planName ?? null,
    mappings,
    unknown ? { id: unknown.id, slug: unknown.slug as string } : null,
  );
}

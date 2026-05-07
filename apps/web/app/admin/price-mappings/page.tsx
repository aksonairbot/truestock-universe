/**
 * /admin/price-mappings — manage product ↔ amount mappings.
 *
 * NOTE: this route is currently NOT auth-gated. Before going live, gate it
 * with the workspace SSO middleware (see lib/auth.ts when added). In the
 * meantime, only deploy this app with the admin route blocked at the
 * App Platform / load balancer level, OR run it on a private network.
 */
import {
  getDb,
  products,
  productPriceMappings,
  payments,
  sql,
  eq,
  desc,
  asc,
  gte,
} from "@tu/db";
import { formatInrFromPaise, formatRelative } from "@/lib/format";
import { createMapping, setMappingActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function PriceMappingsPage() {
  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // All products (excluding the unknown bucket — that one shouldn't have mappings)
  const productList = await db
    .select({ id: products.id, slug: products.slug, name: products.name, color: products.color })
    .from(products)
    .where(sql`${products.slug} <> 'unknown'`)
    .orderBy(asc(products.slug));

  // All mappings, joined to products
  const mappings = await db
    .select({
      id: productPriceMappings.id,
      productId: productPriceMappings.productId,
      productSlug: products.slug,
      productName: products.name,
      planNameMatch: productPriceMappings.planNameMatch,
      amountPaise: productPriceMappings.amountPaise,
      interval: productPriceMappings.interval,
      tolerancePaise: productPriceMappings.tolerancePaise,
      notes: productPriceMappings.notes,
      isActive: productPriceMappings.isActive,
      createdAt: productPriceMappings.createdAt,
    })
    .from(productPriceMappings)
    .innerJoin(products, eq(products.id, productPriceMappings.productId))
    .orderBy(asc(products.slug), desc(productPriceMappings.amountPaise));

  // Hit-count telemetry — how many captured payments matched each mapping in the last 30d.
  // We use mapping_confidence + product_id + amount to attribute, since payments don't FK to mapping_id.
  const hitCounts = new Map<string, number>();
  for (const m of mappings) {
    // Exact-amount matches in last 30d for this product
    const [row] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(payments)
      .where(
        sql`${payments.productId} = ${m.productId}
            and ${payments.amountPaise} = ${m.amountPaise}::bigint
            and ${payments.status} = 'captured'
            and ${payments.capturedAt} >= ${thirtyDaysAgo.toISOString()}`,
      );
    hitCounts.set(m.id, row?.c ?? 0);
  }

  // Group mappings by product for nicer UI
  const grouped = new Map<string, typeof mappings>();
  for (const m of mappings) {
    const k = m.productSlug;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(m);
  }

  // Recent unmapped (unknown) payments — most actionable signal
  const unmappedRecent = await db
    .select({
      id: payments.id,
      razorpayPaymentId: payments.razorpayPaymentId,
      amountPaise: payments.amountPaise,
      capturedAt: payments.capturedAt,
    })
    .from(payments)
    .innerJoin(products, eq(products.id, payments.productId))
    .where(sql`${products.slug} = 'unknown' and ${payments.status} = 'captured'`)
    .orderBy(desc(payments.capturedAt))
    .limit(8);

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Admin · Price mappings</div>
          <div className="text-text-2 text-sm mt-1">
            Razorpay payments are matched to products by amount. Edit mappings here when prices
            change or new plans launch.
          </div>
        </div>
        <a href="/mis/revenue" className="text-sm text-text-2 hover:text-text">
          ← Revenue dashboard
        </a>
      </div>

      {unmappedRecent.length > 0 && (
        <div className="mb-6 p-4 rounded-lg border border-warning/30 bg-warning/5 text-sm">
          <div className="font-semibold text-warning mb-2">
            ⚠ {unmappedRecent.length} recent unmapped payment{unmappedRecent.length === 1 ? "" : "s"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {unmappedRecent.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-xs text-text-2">
                <span className="mono">{p.razorpayPaymentId}</span>
                <span className="mono font-semibold text-text">
                  {formatInrFromPaise(p.amountPaise, { compact: false })}
                </span>
                <span className="text-text-3">{formatRelative(p.capturedAt)}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-text-3 mt-3">
            Add a mapping below for any of these amounts to backfill them on the next sync.
          </div>
        </div>
      )}

      {/* Add new mapping */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold mb-1">Add new mapping</h3>
        <p className="text-xs text-text-3 mb-3">
          Plan name (when known) is the primary match signal — paste the exact string Razorpay
          sends in <code className="mono">subscription.plan.item.name</code>. Amount is the
          fallback for one-off payments.
        </p>
        <form
          action={async (formData) => {
            "use server";
            await createMapping(formData);
          }}
          className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end"
        >
          <Field label="Product">
            <select
              name="productId"
              required
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="">Select…</option>
              {productList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Plan name (optional)" className="md:col-span-2">
            <input
              name="planNameMatch"
              type="text"
              placeholder="FinX Bloom Rise(Monthly)"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Amount (INR)">
            <input
              name="amountInr"
              type="number"
              step="0.01"
              min="1"
              required
              placeholder="1999"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full mono"
            />
          </Field>
          <Field label="Interval">
            <select
              name="interval"
              required
              defaultValue="monthly"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="monthly">monthly</option>
              <option value="quarterly">quarterly</option>
              <option value="half_yearly">half-yearly</option>
              <option value="yearly">yearly</option>
              <option value="one_off">one-off</option>
            </select>
          </Field>
          <Field label="Tolerance (paise)">
            <input
              name="tolerancePaise"
              type="number"
              min="0"
              max="500"
              defaultValue="100"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full mono"
            />
          </Field>
          <Field label="Notes">
            <input
              name="notes"
              type="text"
              placeholder="Bloom Rise · monthly"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <button
            type="submit"
            className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-4 py-1.5 transition"
          >
            Add mapping
          </button>
        </form>
      </div>

      {/* Existing mappings, grouped by product */}
      <div className="space-y-5">
        {productList.map((p) => {
          const rows = grouped.get(p.slug) ?? [];
          return (
            <div key={p.id} className="card p-0">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`pchip ${p.slug}`}>{p.name}</span>
                  <span className="text-xs text-text-3">
                    {rows.filter((r) => r.isActive).length} active /{" "}
                    {rows.filter((r) => !r.isActive).length} archived
                  </span>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className="px-5 py-6 text-text-3 text-sm text-center border-t border-border">
                  No mappings yet. Add one above.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-text-3 text-xs uppercase tracking-wider">
                    <tr className="border-y border-border bg-panel-2">
                      <th className="text-left px-5 py-2 font-semibold">Plan name</th>
                      <th className="text-right px-5 py-2 font-semibold">Amount</th>
                      <th className="text-left px-5 py-2 font-semibold">Interval</th>
                      <th className="text-right px-5 py-2 font-semibold">Tol.</th>
                      <th className="text-left px-5 py-2 font-semibold">Notes</th>
                      <th className="text-right px-5 py-2 font-semibold">30d hits</th>
                      <th className="text-right px-5 py-2 font-semibold">Status</th>
                      <th className="px-5 py-2 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr
                        key={m.id}
                        className={`border-b border-border last:border-0 hover:bg-hover/40 ${
                          !m.isActive ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-5 py-2.5 mono text-xs">
                          {m.planNameMatch ? (
                            <span className="text-text">{m.planNameMatch}</span>
                          ) : (
                            <span className="text-text-3 italic">— amount-only</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 mono text-right font-semibold">
                          {formatInrFromPaise(m.amountPaise, { compact: false })}
                        </td>
                        <td className="px-5 py-2.5 text-text-2 text-xs">{m.interval}</td>
                        <td className="px-5 py-2.5 mono text-right text-text-3 text-xs">
                          ±{m.tolerancePaise}p
                        </td>
                        <td className="px-5 py-2.5 text-text-3 text-xs">{m.notes ?? "—"}</td>
                        <td className="px-5 py-2.5 mono text-right">
                          {(hitCounts.get(m.id) ?? 0) === 0 ? (
                            <span className="text-text-3">0</span>
                          ) : (
                            <span className="text-success">{hitCounts.get(m.id)}</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          {m.isActive ? (
                            <span className="text-xs text-success">● active</span>
                          ) : (
                            <span className="text-xs text-text-3">○ archived</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-right">
                          <ToggleForm id={m.id} active={m.isActive} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center text-xs text-text-3 mt-8 pb-4">
        Truestock Universe · Admin · Price mappings
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs text-text-3 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function ToggleForm({ id, active }: { id: string; active: boolean }) {
  return (
    <form
      action={async () => {
        "use server";
        await setMappingActive(id, !active);
      }}
    >
      <button
        type="submit"
        className="text-xs text-text-3 hover:text-text px-2 py-1 rounded-md hover:bg-hover transition"
      >
        {active ? "Archive" : "Restore"}
      </button>
    </form>
  );
}

/**
 * /admin/payments/new — single manual-payment entry form.
 *
 * Use when you want to log a payment right now without waiting for the
 * Razorpay webhook to flow. Tagged with source='manual' so it's visibly
 * distinct from ingested data on the revenue dashboard.
 */
import { getDb, products, asc, sql } from "@tu/db";
import { SELECTABLE_PRODUCT_SLUGS } from "../shared";
import { createManualPayment } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const db = getDb();
  const productList = await db
    .select({ id: products.id, slug: products.slug, name: products.name })
    .from(products)
    .where(sql`${products.slug} in (${sql.raw(
      SELECTABLE_PRODUCT_SLUGS.map((s) => `'${s}'`).join(","),
    )})`)
    .orderBy(asc(products.slug));

  const today = new Date().toISOString().slice(0, 10);
  const timeNow = new Date().toLocaleTimeString("en-IN", { hour12: false });

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[900px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Add payment — manual</div>
          <div className="text-text-2 text-sm mt-1">
            Log a single payment. The revenue dashboard updates instantly. Tag:{" "}
            <code className="mono">source='manual'</code>.
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <a href="/admin/payments/import" className="text-text-2 hover:text-text">
            Bulk CSV →
          </a>
          <a href="/mis/revenue" className="text-text-2 hover:text-text">
            Dashboard →
          </a>
        </div>
      </div>

      <form action={createManualPayment} className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Product *">
            <select
              name="productSlug"
              required
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              {productList.map((p) => (
                <option key={p.id} value={p.slug as string}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount (INR) *">
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
          <Field label="Method">
            <select
              name="method"
              defaultValue=""
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="">—</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="netbanking">Netbanking</option>
              <option value="wallet">Wallet</option>
              <option value="emi">EMI</option>
              <option value="other">Other</option>
            </select>
          </Field>

          <Field label="Date *">
            <input
              name="date"
              type="date"
              required
              defaultValue={today}
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Time (IST)">
            <input
              name="time"
              type="time"
              step="1"
              defaultValue={timeNow}
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full mono"
            />
          </Field>
          <Field label="Description">
            <select
              name="description"
              defaultValue=""
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="">—</option>
              <option value="Subscribed">Subscribed (new)</option>
              <option value="Recurring Payment via Subscription">Recurring</option>
              <option value="One-time">One-time</option>
            </select>
          </Field>

          <Field label="Customer email" className="md:col-span-1">
            <input
              name="customerEmail"
              type="email"
              placeholder="user@example.com"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Customer phone">
            <input
              name="customerPhone"
              type="tel"
              placeholder="919xxxxxxxxx"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full mono"
            />
          </Field>
          <Field label="Entered by">
            <input
              name="enteredBy"
              type="text"
              placeholder="amit@truestock.in"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>

          <Field label="Plan name (optional)" className="md:col-span-2">
            <input
              name="planName"
              type="text"
              placeholder="FinX Bloom Rise(Monthly)"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </Field>
          <Field label="Razorpay payment ID (if known)">
            <input
              name="razorpayPaymentId"
              type="text"
              placeholder="pay_XXXX (leave blank to auto-generate)"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full mono"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
          <p className="text-xs text-text-3">
            Duplicates are prevented via a hash of (date, amount, email/phone). Re-submitting
            the same payment is safe.
          </p>
          <button
            type="submit"
            className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-5 py-2 transition"
          >
            Record payment
          </button>
        </div>
      </form>

      <div className="text-center text-xs text-text-3 mt-8 pb-4">
        Truestock Universe · Admin · Manual payment entry
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

/**
 * /admin/payments/import — bulk CSV / TSV paste for backfilling historical
 * payment data (e.g., from the Data Zone workbook sheets).
 *
 * Expected columns (any order; header row required):
 *   date, time, amount_inr, product, description, customer_email,
 *   customer_phone, plan_name, razorpay_payment_id
 *
 * The parser accepts:
 *   - comma or tab delimited (pasted from Excel / Sheets = tab)
 *   - dates in YYYY-MM-DD or DD/MM/YYYY
 *   - amount with ₹, commas, decimals
 *   - product slugs: stock_bee/stockbee/bee/sb, bloom/bloomalgo/ba, high, axe_cap
 *
 * Duplicates are deduped via synthetic id = hash(date, amount, email/phone).
 */
import { SELECTABLE_PRODUCT_SLUGS } from "../shared";
import { importCsvPayments } from "../actions";

export const dynamic = "force-dynamic";

export default function ImportCsvPage() {
  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1100px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">
            Import payments — CSV paste
          </div>
          <div className="text-text-2 text-sm mt-1">
            Paste rows from your spreadsheet (tab or comma delimited). Idempotent — re-pasting
            the same rows won't duplicate.
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <a href="/admin/payments/new" className="text-text-2 hover:text-text">
            Single payment →
          </a>
          <a href="/mis/revenue" className="text-text-2 hover:text-text">
            Dashboard →
          </a>
        </div>
      </div>

      <div className="card mb-4">
        <h3 className="text-sm font-semibold mb-2">Expected columns</h3>
        <div className="mono text-xs text-text-2 bg-panel-2 border border-border rounded-md p-3 overflow-x-auto">
          date{"\t"}time{"\t"}amount_inr{"\t"}product{"\t"}description{"\t"}customer_email
          {"\t"}customer_phone{"\t"}plan_name{"\t"}razorpay_payment_id
        </div>
        <details className="mt-3">
          <summary className="text-xs text-text-3 cursor-pointer">
            Show example rows (click)
          </summary>
          <pre className="mono text-xs text-text-2 bg-panel-2 border border-border rounded-md p-3 mt-2 overflow-x-auto">
{`date	time	amount_inr	product	description	customer_email	customer_phone	plan_name
2026-04-01	05:07:39	1999	bloom	Recurring Payment via Subscription		918790032200	FinX Bloom Rise(Monthly)
2026-04-02	19:01:29	1999	bloom	Subscribed	user@truestock.in	919766563754	FinX Bloom Rise(Monthly)
2026-04-02	13:29:18	299	stock_bee	Subscribed		917795648820	Swift Pro Plan(Monthly)
2026-04-07	16:59:28	3999	stock_bee	Subscribed		918810552316	Stock Bee Turbo(Monthly)`}
          </pre>
          <p className="text-xs text-text-3 mt-2">
            Any column is optional except <code className="mono">date</code> and{" "}
            <code className="mono">amount_inr</code>. Unknown columns are ignored. If you
            leave <code className="mono">product</code> out, pick a default below.
          </p>
        </details>
      </div>

      <form action={importCsvPayments} className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <label className="flex flex-col gap-1 md:col-span-1">
            <span className="text-xs text-text-3 uppercase tracking-wider">
              Default product (if column missing)
            </span>
            <select
              name="defaultProduct"
              defaultValue=""
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="">— require per-row</option>
              {SELECTABLE_PRODUCT_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {slug}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-text-3 uppercase tracking-wider">Entered by</span>
            <input
              name="enteredBy"
              type="text"
              placeholder="amit@truestock.in"
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">
            Paste CSV / TSV (header row required)
          </span>
          <textarea
            name="csv"
            required
            rows={16}
            placeholder={`date\ttime\tamount_inr\tproduct\t…\n2026-04-01\t10:15:00\t1999\tbloom\t…`}
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full mono font-mono"
          ></textarea>
        </label>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
          <p className="text-xs text-text-3">
            Reports inserted / skipped / unmapped. Rows with errors are listed below so you
            can fix and re-paste.
          </p>
          <button
            type="submit"
            className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-5 py-2 transition"
          >
            Import rows
          </button>
        </div>
      </form>

      <div className="text-center text-xs text-text-3 mt-8 pb-4">
        Truestock Universe · Admin · Bulk import
      </div>
    </div>
  );
}

import {
  revenueBetween,
  revenueByProductBetween,
  dailyRevenueByProduct,
  recentPayments,
  approximateMrrPaise,
  unmappedPaymentCount,
  paymentSourceBreakdown,
  type ByProductRow,
  type DailyRevenuePoint,
} from "@/lib/metrics";
import { formatInrFromPaise, formatRelative } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  // Time windows (IST is UTC+5:30 — ignore for now, dashboard is approximate)
  const now = new Date();
  const startOfToday = startOfDayUtc(now);
  const tomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last30To = now;
  const prev7Start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const prev7End = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last7Start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    today,
    last7,
    prev7,
    mtd,
    byProductMtd,
    daily,
    recent,
    mrrPaise,
    unmapped,
    sourceBreakdown,
  ] = await Promise.all([
    revenueBetween(startOfToday, tomorrow),
    revenueBetween(last7Start, now),
    revenueBetween(prev7Start, prev7End),
    revenueBetween(startOfMonth, tomorrow),
    revenueByProductBetween(startOfMonth, tomorrow),
    dailyRevenueByProduct(last30Start, last30To),
    recentPayments(20),
    approximateMrrPaise(),
    unmappedPaymentCount(startOfMonth, tomorrow),
    paymentSourceBreakdown(startOfMonth, tomorrow),
  ]);

  const arrPaise: bigint = (mrrPaise as bigint) * BigInt(12);

  const wow =
    prev7.netPaise > BigInt(0)
      ? Number(((last7.netPaise - prev7.netPaise) * BigInt(1000)) / prev7.netPaise) / 10
      : null;

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">MIS · Revenue</div>
          <div className="text-text-2 text-sm mt-1">
            Live from <span className="mono">payments</span> table · sliced by product ·{" "}
            <a href="/admin/payments/new" className="text-accent-2 hover:underline">
              add manually
            </a>
            {" · "}
            <a href="/admin/payments/import" className="text-accent-2 hover:underline">
              bulk import
            </a>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="px-3 py-1.5 rounded-md bg-panel border border-border-2 text-sm text-text-2">
            All products
          </span>
          <span className="px-3 py-1.5 rounded-md bg-panel border border-border-2 text-sm text-text-2">
            This month
          </span>
        </div>
      </div>

      {/* Source mix — shows manual vs Razorpay data proportion */}
      {sourceBreakdown.length > 1 && (
        <div className="mb-5 p-3 rounded-lg bg-panel border border-border flex items-center gap-3 text-xs">
          <span className="text-text-3 uppercase tracking-wider">MTD data sources</span>
          {sourceBreakdown.map((s) => (
            <span key={s.source} className="flex items-center gap-1.5">
              <span
                className={
                  "inline-block w-2 h-2 rounded-full " +
                  (s.source === "razorpay_webhook" || s.source === "razorpay_api"
                    ? "bg-success"
                    : s.source === "manual" || s.source === "csv_import"
                      ? "bg-warning"
                      : "bg-text-3")
                }
              />
              <span className="text-text">{s.source}</span>
              <span className="text-text-3 mono">
                {s.paymentCount} · {formatInrFromPaise(s.netPaise, { compact: true })}
              </span>
            </span>
          ))}
        </div>
      )}

      {unmapped > 0 && (
        <div className="mb-5 p-3 rounded-lg border border-warning/30 bg-warning/5 text-sm flex items-center gap-3">
          <span className="text-warning">⚠</span>
          <div>
            <b>{unmapped} payment{unmapped === 1 ? "" : "s"}</b> this month had no matching
            product price. They&rsquo;re bucketed under <code className="mono">unknown</code>.{" "}
            <a className="text-accent-2" href="/admin/price-mappings">
              Review mappings →
            </a>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="MRR (approx)"
          value={formatInrFromPaise(mrrPaise)}
          subtitle="active subs · normalised to month"
        />
        <KpiCard
          title="ARR (12 × MRR)"
          value={formatInrFromPaise(arrPaise)}
          subtitle="forward-looking"
        />
        <KpiCard
          title="Revenue · today"
          value={formatInrFromPaise(today.netPaise)}
          subtitle={`${today.paymentCount} payment${today.paymentCount === 1 ? "" : "s"}`}
        />
        <KpiCard
          title="Revenue · last 7d"
          value={formatInrFromPaise(last7.netPaise)}
          subtitle={
            wow == null
              ? "no prior window"
              : `${wow >= 0 ? "▲" : "▼"} ${Math.abs(wow).toFixed(1)}% vs prev 7d`
          }
          subtitleClass={wow == null ? "" : wow >= 0 ? "text-success" : "text-danger"}
        />
      </div>

      {/* MTD strip */}
      <div className="card mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-text-2 text-xs uppercase tracking-wider">Month to date</div>
            <div className="mono text-3xl font-semibold mt-1">
              {formatInrFromPaise(mtd.netPaise)}
            </div>
            <div className="text-text-3 text-xs mt-1">
              gross {formatInrFromPaise(mtd.grossPaise)} · refunds{" "}
              {formatInrFromPaise(mtd.refundsPaise)} · {mtd.paymentCount} payments
            </div>
          </div>
        </div>
        <RevenueChart points={daily} />
      </div>

      {/* Per product */}
      <div className="card mb-6 p-0">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">By product · month to date</h3>
          <span className="text-xs text-text-3">net of refunds</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-text-3 text-xs uppercase tracking-wider">
            <tr className="border-y border-border bg-panel-2">
              <th className="text-left px-5 py-2.5 font-semibold">Product</th>
              <th className="text-right px-5 py-2.5 font-semibold">Net revenue</th>
              <th className="text-right px-5 py-2.5 font-semibold">Payments</th>
              <th className="text-right px-5 py-2.5 font-semibold">Active subs</th>
              <th className="text-right px-5 py-2.5 font-semibold">% of MTD</th>
            </tr>
          </thead>
          <tbody>
            {byProductMtd
              .filter((r) => r.productSlug !== "universe")
              .map((row) => (
                <ProductRow key={row.productId} row={row} totalPaise={mtd.netPaise} />
              ))}
          </tbody>
        </table>
      </div>

      {/* Recent payments */}
      <div className="card p-0">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent captured payments</h3>
          <span className="text-xs text-text-3">live from Razorpay</span>
        </div>
        {recent.length === 0 ? (
          <div className="px-5 py-12 text-center text-text-3 text-sm">
            No captured payments yet. Set up the Razorpay webhook (or run a sync) to get
            data flowing.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-text-3 text-xs uppercase tracking-wider">
              <tr className="border-y border-border bg-panel-2">
                <th className="text-left px-5 py-2.5 font-semibold">When</th>
                <th className="text-left px-5 py-2.5 font-semibold">Customer</th>
                <th className="text-left px-5 py-2.5 font-semibold">Product</th>
                <th className="text-left px-5 py-2.5 font-semibold">Method</th>
                <th className="text-left px-5 py-2.5 font-semibold">Source</th>
                <th className="text-left px-5 py-2.5 font-semibold">Payment ID</th>
                <th className="text-right px-5 py-2.5 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-hover/40">
                  <td className="px-5 py-2.5 text-text-2 mono">{formatRelative(p.capturedAt)}</td>
                  <td className="px-5 py-2.5">{p.customerEmail ?? <span className="text-text-3">—</span>}</td>
                  <td className="px-5 py-2.5">
                    {p.productSlug ? (
                      <span className={`pchip ${p.productSlug}`}>{p.productName ?? p.productSlug}</span>
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                    {p.mappingConfidence && Number(p.mappingConfidence) < 1 && (
                      <span className="ml-2 text-xs text-warning" title="Fuzzy / unmapped">
                        ~
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-text-2">{p.method ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    <SourceBadge source={p.source} />
                  </td>
                  <td className="px-5 py-2.5 mono text-xs text-text-3">{p.razorpayPaymentId}</td>
                  <td className="px-5 py-2.5 mono text-right">
                    {formatInrFromPaise(p.amountPaise, { compact: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-center text-xs text-text-3 mt-8 pb-4">
        Truestock Universe · MIS v0.1 · Razorpay slice
      </div>
    </div>
  );
}

// ============================================================================
// inline components
// ============================================================================

function KpiCard({
  title,
  value,
  subtitle,
  subtitleClass,
}: {
  title: string;
  value: string;
  subtitle: string;
  subtitleClass?: string;
}) {
  return (
    <div className="card">
      <div className="text-text-2 text-xs font-medium tracking-wide">{title}</div>
      <div className="mono text-2xl font-semibold mt-2">{value}</div>
      <div className={`text-xs text-text-2 mt-1 ${subtitleClass ?? ""}`}>{subtitle}</div>
    </div>
  );
}

function ProductRow({
  row,
  totalPaise,
}: {
  row: ByProductRow;
  totalPaise: bigint;
}) {
  const pct =
    totalPaise > BigInt(0) ? Number((row.netPaise * BigInt(1000)) / totalPaise) / 10 : 0;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-hover/40">
      <td className="px-5 py-3">
        <span className={`pchip ${row.productSlug}`}>{row.productName}</span>
      </td>
      <td className="px-5 py-3 mono text-right">{formatInrFromPaise(row.netPaise)}</td>
      <td className="px-5 py-3 mono text-right text-text-2">{row.paymentCount}</td>
      <td className="px-5 py-3 mono text-right text-text-2">{row.activeSubs}</td>
      <td className="px-5 py-3 mono text-right text-text-2">{pct.toFixed(1)}%</td>
    </tr>
  );
}

function RevenueChart({ points }: { points: DailyRevenuePoint[] }) {
  // Aggregate to one series per day (sum across products).
  const byDay = new Map<string, bigint>();
  for (const p of points) {
    byDay.set(p.date, (byDay.get(p.date) ?? BigInt(0)) + p.netPaise);
  }
  const days = Array.from(byDay.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  if (days.length < 2) {
    return (
      <div className="text-text-3 text-sm py-12 text-center">
        Not enough data yet — chart appears once you have ≥ 2 days of payments.
      </div>
    );
  }

  const W = 1000;
  const H = 220;
  const PAD = 16;
  const max = days.reduce<bigint>((m, [, v]) => (v > m ? v : m), BigInt(0));
  const maxN = Number(max);
  const stepX = (W - 2 * PAD) / Math.max(1, days.length - 1);

  const pts = days.map(([, v], i) => {
    const x = PAD + i * stepX;
    const y =
      maxN === 0
        ? H - PAD
        : H - PAD - (Number(v) / maxN) * (H - 2 * PAD);
    return { x, y };
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const fillPath =
    linePath +
    ` L${pts.at(-1)!.x.toFixed(1)},${H - PAD} L${pts[0]!.x.toFixed(1)},${H - PAD} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="rev-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7B5CFF" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#7B5CFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={H - PAD - f * (H - 2 * PAD)}
            y2={H - PAD - f * (H - 2 * PAD)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={1}
          />
        ))}
        <path d={fillPath} fill="url(#rev-grad)" />
        <path d={linePath} fill="none" stroke="#7B5CFF" strokeWidth={1.8} />
      </svg>
      <div className="flex justify-between text-xs text-text-3 mt-2 mono">
        <span>{days[0]?.[0]}</span>
        <span>{days.at(-1)?.[0]}</span>
      </div>
    </div>
  );
}

function startOfDayUtc(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    razorpay_webhook: { label: "razorpay", cls: "bg-success/10 text-success border-success/30" },
    razorpay_api: { label: "razorpay·api", cls: "bg-success/10 text-success border-success/30" },
    manual: { label: "manual", cls: "bg-warning/10 text-warning border-warning/30" },
    csv_import: { label: "csv", cls: "bg-warning/10 text-warning border-warning/30" },
    sheet_import: { label: "sheet", cls: "bg-warning/10 text-warning border-warning/30" },
  };
  const m = map[source] ?? { label: source, cls: "bg-panel-2 text-text-3 border-border-2" };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10.5px] font-semibold mono ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

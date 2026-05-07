import Razorpay from "razorpay";
import type { RazorpayPayment } from "./types.js";

let _client: Razorpay | null = null;

export function getRazorpayClient() {
  if (_client) return _client;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required for Razorpay API calls",
    );
  }
  _client = new Razorpay({ key_id, key_secret });
  return _client;
}

/**
 * Fetch all payments captured between `from` and `to` (Date objects).
 * Pages through Razorpay's 100-per-call limit.
 *
 * Razorpay returns `created_at` as unix seconds (UTC). We pass `from`/`to`
 * as unix seconds too.
 */
export async function fetchPaymentsSince(opts: {
  from: Date;
  to?: Date;
  pageSize?: number;
}): Promise<RazorpayPayment[]> {
  const client = getRazorpayClient();
  const fromS = Math.floor(opts.from.getTime() / 1000);
  const toS = opts.to ? Math.floor(opts.to.getTime() / 1000) : Math.floor(Date.now() / 1000);
  const count = Math.min(opts.pageSize ?? 100, 100);

  const all: RazorpayPayment[] = [];
  let skip = 0;

  // hard ceiling so a runaway loop can't drain quotas
  const MAX_PAGES = 100;
  for (let page = 0; page < MAX_PAGES; page++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp: any = await (client.payments as any).all({
      from: fromS,
      to: toS,
      count,
      skip,
    });
    const items: RazorpayPayment[] = resp?.items ?? [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < count) break;
    skip += count;
  }

  return all;
}

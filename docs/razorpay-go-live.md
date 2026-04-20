# Razorpay → Universe · Go-live checklist

What needs to be true before live Razorpay data flows into Universe. Work the
phases in order — don't skip Phase 0 even if you're in a hurry, because
amount-matching needs to be validated against real test data first.

---

## Phase 0 — what you need from Razorpay

Things to grab from the Razorpay dashboard. Most are one-time; a couple need
two flavours (test + live).

### Account access

- [ ] Truestock has an active Razorpay merchant account
- [ ] **KYC is complete** (mandatory before Live mode is unlocked)
- [ ] All four products (Stock Bee, High, Axe Cap, Bloom) collect via this same
      account *or* you've decided to use separate accounts per product (changes
      the integration — see "Multi-account variant" at the bottom)

### Credentials

For each environment (Test, then Live):

- [ ] **Key ID** (`rzp_test_xxx` or `rzp_live_xxx`) — Settings → API Keys →
      Generate
- [ ] **Key Secret** — shown only once at generation time; store immediately
- [ ] **Webhook Secret** — Settings → Webhooks → choose a strong random string
      (32+ chars). Use `openssl rand -hex 32` to generate. **You set this**;
      Razorpay just stores it.

### Plans & subscription products

For Universe to identify products by amount, the seed in
`packages/db/src/seed.ts` must match the *actual* Razorpay plan amounts for
each product.

- [ ] Export the active plans for each product from Razorpay dashboard
      (Subscriptions → Plans). For each, capture: plan name, plan_id, amount
      in INR, billing period.
- [ ] Compare to `SEEDS` in `packages/db/src/seed.ts`. If they differ, edit the
      seed *before* running it on the production DB — or edit the
      `product_price_mappings` table after seeding via `/admin/price-mappings`.
- [ ] Note any **promotional / discounted** prices in use today (e.g. ₹399
      Stock Bee promo). Either add them as additional mappings, or let them
      flow through the `unknown` bucket initially and reconcile later.
- [ ] Note any **GST-inclusive vs exclusive** quirks — Razorpay charges the
      *gross* amount; if your displayed prices are pre-GST, the captured
      amounts won't match.

### Historical backfill window

- [ ] Decide how far back to backfill. The script defaults to 90 days. If you
      want everything since launch, pass `--since 2023-01-01` (Razorpay keeps
      payment history indefinitely on the API).
- [ ] Estimate volume: visit dashboard → Reports → All transactions → set
      window → check count. Backfill runs ~5–10 payments/sec, so 10k payments
      ≈ 30 minutes.

---

## Phase 1 — what you need on our side

### Infrastructure

- [ ] **DO Managed Postgres 16+** provisioned (any region; `blr1` is closest
      to the app). At least the `db-s-1vcpu-1gb` tier ($15/mo) for v1.
- [ ] **Connection string** copied — it'll be `DATABASE_URL` in env. Append
      `?sslmode=require` if not already present (DO usually does this).
- [ ] **DO App Platform** project created (or you're running locally + tunnelling).

### Repo prep

```bash
pnpm install
cp .env.example .env
# Fill in the env vars below
pnpm db:generate         # writes drizzle/0000_*.sql from schema.ts
pnpm db:migrate          # applies to DATABASE_URL
pnpm db:seed             # inserts products + price mappings
pnpm test                # 41 tests should pass
```

### Environment variables

| Variable | Where it comes from | Test value | Live value |
|---|---|---|---|
| `DATABASE_URL` | DO Postgres → connection details | local Postgres | DO Postgres URL |
| `RAZORPAY_KEY_ID` | RZP dashboard → API Keys | `rzp_test_xxx` | `rzp_live_xxx` |
| `RAZORPAY_KEY_SECRET` | RZP dashboard → API Keys | shown at gen | shown at gen |
| `RAZORPAY_WEBHOOK_SECRET` | You generate; mirror in RZP | 32+ char random | different 32+ char |
| `INTERNAL_API_SECRET` | You generate (`openssl rand -hex 32`) | — | — |
| `NEXT_PUBLIC_APP_URL` | Your hostname | `http://localhost:3000` | `https://xxx.ondigitalocean.app` |
| `SENTRY_DSN` | Sentry (optional) | — | — |

---

## Phase 2 — Test mode end-to-end (do this first)

The point: validate webhook signature, amount → product mapping, and DB
upserts against real-shape Razorpay events before any live money moves.

1. **Run the app locally**: `pnpm dev` → `http://localhost:3000/mis/revenue`
2. **Tunnel it**: in another terminal, `ngrok http 3000`. Copy the
   `https://xxxx.ngrok-free.app` URL.
3. **Register the test webhook** in Razorpay (Settings → Webhooks → Add):
   - URL: `https://xxxx.ngrok-free.app/api/webhooks/razorpay`
   - Secret: paste your `RAZORPAY_WEBHOOK_SECRET`
   - Active events to subscribe to (minimum):
     - `payment.captured`
     - `payment.failed`
     - `payment.authorized`
     - `subscription.activated`
     - `subscription.charged`
     - `subscription.cancelled`
     - `subscription.completed`
     - `subscription.halted`
     - `refund.created`
     - `refund.processed`
4. **Trigger test events**: in Razorpay dashboard → Webhooks → click the
   webhook → "Send test event" — fires a synthetic `payment.captured`.
5. **Verify in DB**:
   ```sql
   select event_type, processing_status, processed_at
   from razorpay_events order by received_at desc limit 5;
   ```
   Expect `processing_status = 'processed'`. If `failed`, read
   `processing_error`.
6. **Make a real test payment**: use a Razorpay-provided test card on a
   payment page that uses your test Key ID. Verify:
   - The payment lands in `payments` table
   - `product_id` is correctly set (not `unknown`) — if `unknown`, the
     amount didn't match a mapping; fix at `/admin/price-mappings`
   - Revenue dashboard updates within seconds
7. **Test one full subscription lifecycle**:
   - Create a subscription via test API or Razorpay-hosted checkout
   - Verify `subscription.activated` arrives → row appears in `subscriptions`
   - Wait for first charge → verify `subscription.charged` arrives →
     row appears in `payments` with `subscription_id` set
   - Cancel from dashboard → verify `subscription.cancelled` arrives → row
     status updates
8. **Test a refund**: refund a captured test payment from dashboard → verify
   `payments.amount_refunded_paise` updates and `status = 'refunded'`

If all 8 steps pass, you're cleared for Live.

---

## Phase 3 — Live mode rollout

1. **Deploy the app** to DO App Platform: `doctl apps create --spec .do/app.yaml`
   (set all secrets in the dashboard before deploy — see `.env.example`)
2. **Get the live URL** from the App Platform dashboard
   (`https://truestock-universe-xxx.ondigitalocean.app`)
3. **Generate live API keys** in Razorpay (Settings → API Keys → make sure
   you're in Live mode toggle, top-right). Save the secret immediately.
4. **Update DO env vars** with the live `RAZORPAY_KEY_ID` and
   `RAZORPAY_KEY_SECRET`.
5. **Register the live webhook** in Razorpay Live mode:
   - URL: `https://your-app.ondigitalocean.app/api/webhooks/razorpay`
   - Secret: paste the live `RAZORPAY_WEBHOOK_SECRET` (different from test)
   - Subscribe to the same event list as Phase 2
6. **Run the backfill**:
   ```bash
   # First a dry-run to see volume
   pnpm razorpay:backfill -- --since 2024-01-01 --dry-run

   # Then the real thing
   pnpm razorpay:backfill -- --since 2024-01-01
   ```
   This pulls historical payments from the live API and pushes them through
   the same processor the webhook uses. Idempotent — safe to re-run.
7. **Smoke test live**: make one small real payment (₹1 if you can) on a live
   product. Verify it lands within 30s.
8. **Watch the unmapped count**: `/admin/price-mappings` shows recent
   unmapped payments. If anything ends up there, add a mapping.

---

## Phase 4 — what to monitor in the first week

- Daily: how many events failed processing
  ```sql
  select date_trunc('day', received_at), count(*)
  from razorpay_events where processing_status = 'failed'
  group by 1 order by 1 desc limit 7;
  ```
- Daily: payments stuck in unmapped bucket
  (visible at top of `/admin/price-mappings`)
- Daily: webhook deliverability — Razorpay dashboard → Webhooks → recent
  deliveries should be 99%+ green
- Weekly: reconcile against Razorpay dashboard's revenue numbers — the
  `payments` table sum (where status='captured') should match RZP's
  "Settled to bank" within ~1% (small drift from refunds-in-flight,
  test-mode contamination, or unmapped fees).

---

## Gotchas worth knowing now

- **HTTPS only.** Razorpay refuses HTTP webhook URLs in any mode.
- **Test ≠ Live.** Two completely separate accounts internally; test data
  never appears in live and vice versa. Test webhook events do NOT need to be
  identical to live. Both webhooks can coexist (point them at different envs).
- **IP allowlisting.** If you're behind a strict firewall, Razorpay publishes
  egress IPs (Settings → Webhooks → "Server IPs") — allowlist them.
- **Payment amount vs settlement.** The `amount` on a payment is what the
  customer was charged. The amount that hits your bank is `amount - fee - tax`.
  Universe stores all three separately (`amount_paise`, `fee_paise`,
  `tax_paise`); the dashboard reports gross-of-fees revenue. If you want
  net-of-fees revenue, that's a one-line change to the metric query.
- **Subscriptions auto-charge.** The `subscription.charged` event fires on
  every renewal, not just the first one — so the `payments` table grows over
  time even without new customers. That's correct behaviour.
- **Trial periods.** A subscription in trial sends `subscription.activated`
  but no `payment.captured` until the trial ends. Universe handles this —
  the subscription row exists with `status='active'` and zero payments
  attached.
- **Address mismatches.** Razorpay's `customer.email` / `contact` may differ
  across payments for the same logical person. Universe uses
  `razorpay_customer_id` as the primary key, not email — so duplicates only
  happen if the customer was created twice in Razorpay (occasionally happens
  with guest checkouts).
- **Rate limits.** Razorpay API is ~100 req/sec; the backfill paginates at
  100/page so a large window can take minutes. Don't run two backfills in
  parallel.

---

## Multi-account variant (only if you go down this path)

If at some point each product gets its own Razorpay merchant account, the
changes are:

1. Add `razorpay_account_id` column to `payments`, `subscriptions`,
   `customers`, `razorpay_events`
2. Webhook URL becomes per-account: `/api/webhooks/razorpay/[account]/route.ts`
3. Each account has its own `RAZORPAY_KEY_*` env vars (e.g.
   `RAZORPAY_BEE_KEY_ID`, `RAZORPAY_HIGH_KEY_ID`, …)
4. Sync job iterates accounts
5. Product mapping becomes redundant for accounts where the product is fixed
   — `account → product` is 1:1

This is worth ~1 day of work. Defer until actually needed.

---

## What I need from you to make this real

If you want me to drive this end-to-end, share:

1. Confirmation: are we starting in **test mode** for Phase 0 validation, or
   does Razorpay live data already exist that we should backfill?
2. Razorpay dashboard access (or the credentials you've extracted)
3. Actual subscription prices per product (to verify the seed is correct)
4. Whether all four products are on one Razorpay merchant account or separate
5. How far back you want the historical backfill to go

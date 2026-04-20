# Truestock Universe · Runbook (Razorpay slice)

Ops playbook for the on-call engineer. Keep it short, keep it actionable.

---

## 1. Webhook is failing (Razorpay dashboard shows non-2xx)

**Symptoms**: Razorpay dashboard → Webhooks → recent deliveries show 401 / 500.
Revenue dashboard stops updating in realtime.

**Triage**

1. Check logs:
   ```bash
   doctl apps logs <APP_ID> --type run --tail 100 | grep razorpay.webhook
   ```
2. Most common cause: `razorpay.webhook.rejected { reason: "mismatch" }` — the
   webhook secret in Razorpay dashboard drifted from `RAZORPAY_WEBHOOK_SECRET`.
   Fix: set the Razorpay secret to match the env var, or vice versa. Razorpay
   will auto-retry failed deliveries for 24h.
3. Less common: `store_failed` — DB is unreachable. Check DO Postgres status.

**Recovery**: the sync cron (hourly) will catch anything missed once webhooks
work again. For urgency, trigger sync manually:
```bash
curl -X POST -H "Authorization: Bearer $INTERNAL_API_SECRET" \
  "$APP_URL/api/sync/razorpay?since=2026-04-19T00:00:00Z"
```

---

## 2. A payment is tagged to the wrong / unknown product

**Symptoms**: dashboard shows `⚠ N payments this month had no matching product
price`, or a payment is bucketed under the wrong product.

**Fix**

1. Go to `/admin/price-mappings`.
2. If the amount is genuinely new (e.g., discount, promo, new plan), add a
   mapping for it.
3. Wait 1 hour (or re-run sync with a narrow window covering the missed days)
   — the sync re-processes payments and re-attributes products based on the
   updated mapping table.

**Why re-sync works**: `processEvent` uses `ON CONFLICT DO UPDATE` — re-seeing
a payment updates its `product_id` based on the current mapping.

---

## 3. Metrics / dashboard look stale

**Symptoms**: Revenue dashboard shows old numbers even though payments are
flowing.

**Triage**

1. Confirm new payments are landing:
   ```sql
   select count(*), max(captured_at) from payments where captured_at > now() - interval '1 day';
   ```
2. If `count > 0` but dashboard is blank, the Next.js page is being cached.
   The dashboard has `export const dynamic = 'force-dynamic'`, so this
   shouldn't happen — but if it does, redeploy or restart the web service.
3. If `count = 0`, webhook is broken — follow §1.

**Nightly rollup**: the `metrics_daily` table is populated by the
`cron-metrics` job at 02:30 IST. If that's been failing, the revenue dashboard
still works (it queries `payments` directly), but product-level MTD is slightly
stale until the rollup runs.

---

## 4. Sync job is stuck / not running

**Symptoms**: `cron-sync-razorpay` is failing in DO dashboard.

**Triage**

1. Check job logs: `doctl apps logs <APP_ID> --type job --component cron-sync-razorpay`
2. 401 → `INTERNAL_API_SECRET` drift between the cron job env and the web
   service env. Set both to the same value.
3. Razorpay 5xx → transient, will self-heal.
4. DB timeout → Postgres is saturated; upsize the cluster.

---

## 5. Event stuck in `processing_status = 'failed'`

**Symptoms**: event shows up in the dashboard banner or during a vault audit.

**Triage**

1. Pull the raw event:
   ```sql
   select razorpay_event_id, event_type, processing_error, payload
   from razorpay_events
   where processing_status = 'failed'
   order by received_at desc limit 10;
   ```
2. Read `processing_error`. Common causes:
   - `subscription X has no resolvable customer` — means the `customer.id` in
     the payload is malformed or a customer row is missing. Retry by resetting
     the row:
     ```sql
     update razorpay_events set processing_status='pending' where id = '<uuid>';
     ```
     Then trigger a re-process via the backfill script with a narrow window.
3. If a migration is pending or schema drift broke a column, apply the
   migration and re-process.

---

## 6. Initial backfill for a new environment

```bash
# Default: last 90 days
pnpm razorpay:backfill

# Custom window
pnpm razorpay:backfill -- --since 2025-01-01 --until 2025-12-31

# Dry run — fetch + report, no writes
pnpm razorpay:backfill -- --since 2025-01-01 --dry-run
```

---

## 7. Database migrations failed on deploy

App Platform's `db-migrate` PRE_DEPLOY job blocks rollout if migrations fail.

**Triage**

1. Check the migration logs in DO dashboard → Deployments → pre-deploy job.
2. If a migration has a syntax error, fix the schema, regenerate migrations
   (`pnpm db:generate`), commit, redeploy.
3. If a migration conflicts with existing data, you'll need to write a data
   migration. Revert first:
   ```bash
   # Drop the bad migration's changes manually via psql, then delete the
   # corresponding entry from __drizzle_migrations before re-applying.
   ```

---

## 8. Secrets rotation

Every 90 days:

- `RAZORPAY_KEY_SECRET` — rotate in Razorpay dashboard; update env var in
  DO App Platform; no restart needed (env vars refresh on next request).
- `RAZORPAY_WEBHOOK_SECRET` — rotate in Razorpay dashboard AND env var in
  lockstep; webhook will fail-closed during the brief window.
- `INTERNAL_API_SECRET` — generate with `openssl rand -hex 32`; update in
  web service AND cron jobs together.
- `DATABASE_URL` — DO auto-rotates when you reset the database password.

---

## 9. Escalation

If a revenue metric looks wrong and is being shared with leadership:

1. Stop sharing the number.
2. Reconcile against Razorpay dashboard (source of truth).
3. Check the `payments` table for missing / duplicate rows in the window.
4. Compare `metrics_daily` rollups against an ad-hoc SQL query — if they
   differ, rebuild the rollup for that date:
   ```bash
   curl -X POST -H "Authorization: Bearer $INTERNAL_API_SECRET" \
     "$APP_URL/api/cron/metrics?date=2026-04-19"
   ```

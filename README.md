# Truestock Universe

Internal MIS + marketing engine + task manager for Truestock. This repo is the
first slice: a Next.js web app that ingests Razorpay subscription payments into
DigitalOcean Managed Postgres and renders an MIS Revenue dashboard sliced by
product (Stock Bee · High · Axe Cap · Bloom).

## What's in the box

```
truestock-universe/
├── apps/
│   └── web/                Next.js 15 · App Router · Tailwind · TypeScript
│       ├── app/
│       │   ├── mis/revenue   # Revenue dashboard (MRR / ARR / per-product)
│       │   └── api/
│       │       ├── webhooks/razorpay   # Razorpay → Postgres
│       │       └── sync/razorpay       # On-demand reconciliation
│       └── lib/metrics.ts   # Metric aggregation queries
├── packages/
│   ├── db/                 Drizzle schema + client + seed
│   └── razorpay/           SDK wrapper · webhook verifier · event processor
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

Three other modules (marketing engine, tasks, chat) plug into the same
`packages/db` and will be added later.

## Prerequisites

* Node.js 20+
* pnpm 9+
* Postgres 15+ (local Docker or DO Managed Postgres)
* A Razorpay account with API + webhook credentials

## Getting started

```bash
# 1. Install deps
pnpm install

# 2. Set env
cp .env.example .env
# then fill in DATABASE_URL, RAZORPAY_*, INTERNAL_API_SECRET

# 3. Generate + apply migrations, then seed products & price mappings
pnpm db:generate     # writes drizzle/0000_*.sql from schema.ts
pnpm db:migrate      # applies migrations to DATABASE_URL
pnpm db:seed         # inserts products + price mappings

# 4. Run the test suite
pnpm test

# 5. Run the web app
pnpm dev
# → http://localhost:3000/mis/revenue
# → http://localhost:3000/admin/price-mappings
```

### Backfill historical Razorpay data

```bash
pnpm razorpay:backfill                                       # last 90 days
pnpm razorpay:backfill -- --since 2025-01-01 --until 2025-12-31
pnpm razorpay:backfill -- --dry-run                          # no writes
```

## How Razorpay ingest works

Product identification is **by subscription amount** — each product has known
price points in INR (monthly / quarterly / annual). The `product_price_mappings`
table holds these. When a payment lands (webhook or sync) the mapper looks up
the amount (in paise, ±50 paise tolerance) and attaches the matching product.
Unmapped payments go to `metrics_daily` under the `unknown` product bucket and
show up on the Revenue dashboard as a "needs mapping" alert.

### Realtime: webhook

1. In the Razorpay dashboard (Settings → Webhooks) add a webhook pointing at
   `https://your-app.ondigitalocean.app/api/webhooks/razorpay`, with the secret
   set to `RAZORPAY_WEBHOOK_SECRET`.
2. Subscribe to at least: `payment.captured`, `payment.failed`,
   `subscription.activated`, `subscription.charged`, `subscription.cancelled`,
   `subscription.completed`, `refund.created`.
3. Every event lands in `razorpay_events` (raw audit log) and fans out to
   `customers` / `subscriptions` / `payments` / `metrics_daily`.

### Reconciliation: sync

`POST /api/sync/razorpay?since=2026-04-01` with `Authorization: Bearer <INTERNAL_API_SECRET>`
pulls payments from Razorpay for the window and upserts anything missing.
Schedule this hourly via DO App Platform cron (or whatever scheduler) —
safety net for dropped webhooks.

### Local webhook testing

Use ngrok or cloudflared:

```bash
ngrok http 3000
# paste the https URL + /api/webhooks/razorpay into Razorpay dashboard
```

Or fire a test event with curl — see `packages/razorpay/src/README.md` for a
signed sample payload.

## Database

Drizzle ORM + `postgres-js` driver. Migrations are code-first:

```bash
pnpm db:generate   # writes SQL migrations from schema.ts
pnpm db:push       # applies schema directly (dev)
pnpm db:studio     # open a local DB explorer
```

Production: run migrations on deploy (`pnpm --filter @tu/db migrate`).

## Deployment

**Primary: self-hosted droplet** — $19/mo (Basic 2 GB droplet + Managed Postgres Dev).
See [`deploy/README.md`](./deploy/README.md) for the full walkthrough.

```bash
# On a fresh Ubuntu 24.04 droplet, as root:
git clone https://github.com/truestock/truestock-universe.git /tmp/tu
bash /tmp/tu/deploy/scripts/provision.sh
# → installs Node + pnpm + Caddy + systemd units + UFW; ~3 min
```

Stack: Next.js via systemd, Caddy for auto-TLS reverse proxy, DO Managed
Postgres (separate), systemd timers for hourly sync + nightly metrics, CI
deploys via GitHub Actions. No App Platform, no Docker, no PM2.

**Alternative: DigitalOcean App Platform** — managed, slightly more expensive,
less control. Two specs in `.do/`:

| Spec | Monthly | Postgres |
|---|---|---|
| `.do/app.minimal.yaml` | $19 | DO Managed Postgres Dev tier ($7) |
| `.do/app.yaml` | $27 | DO Managed Postgres Basic ($15) |

See [`docs/sizing.md`](./docs/sizing.md) for the tier comparison.

First deploy:

```bash
# Set all secrets in the App Platform dashboard first:
# DATABASE_URL, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
# INTERNAL_API_SECRET, SENTRY_DSN (optional)
doctl apps create --spec .do/app.yaml

# Subsequent deploys
doctl apps update <APP_ID> --spec .do/app.yaml
```

What the spec provisions:

| Component | Kind | Role |
|---|---|---|
| `web` | Service | Next.js app (dashboard, webhook, admin) |
| `cron-sync-razorpay` | Cron (hourly) | Razorpay reconciliation |
| `cron-metrics` | Cron (02:30 IST) | Nightly metrics_daily rollup |
| `db-migrate` | PRE_DEPLOY job | Applies pending migrations before each release |
| `truestock-db` | Managed Postgres 16 | DB |

**Ops runbook**: see `docs/runbook.md` for webhook failures, mapping fixes, sync issues, rotations.

## Next modules

- `apps/agents` (Python FastAPI) — marketing / ops agents behind LiteLLM
- `apps/mobile` (Expo + React Native) — approvals + tasks + pulse
- More `packages/` — Meta Ads, Google Ads, Cabinet vault client, auth (Google SSO)
- More pages in `apps/web` — Tasks, Marketing, Chat, Members, Products

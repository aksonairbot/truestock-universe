# Truestock Universe · Sizing & Cost

How to pick an infrastructure tier, what breaks at each level, when to scale up.

**Single-vendor rule:** everything lives on DigitalOcean. Third-party free tiers
were considered and rejected — the operational and billing complexity of a
multi-vendor setup isn't worth $5–10/mo for a revenue-of-record system.

---

## The load we're sizing for

Computed from the Apr 2026 Data Zone workbook (1,039 payments, 14 months).

| Dimension | Current | Peak observed |
|---|---|---|
| Payments per day | 2–3 | 5.8 (Sep 2025) |
| Razorpay events per day (≈ 4× payments) | ~12 | ~25 |
| Internal users (total) | ~20 | — |
| Concurrent users peak | ~8 | — |
| DB size (year-1 projection) | <200 MB | ~500 MB |

Capacity headroom for reference: an App Platform `basic-xs` instance handles
~500 webhook events/sec and hundreds of concurrent page loads. Peak load
above is four orders of magnitude below that ceiling.

---

## Three tiers (all DO)

| Tier | Cost/mo | Web | Postgres | Best for |
|---|---|---|---|---|
| **Tier A — Single droplet, self-hosted PG** | **$12** | 2 GB droplet runs Next.js + Postgres | self-hosted on droplet | throwaway / dev only |
| **Tier B — Droplet + Managed PG (recommended)** | **$19** | 2 GB droplet runs Next.js | DO Managed Postgres Dev | **20-user production** |
| **Tier B-alt — App Platform + Managed PG** | **$19** | App Platform basic-xs (1 GB) | DO Managed Postgres Dev | zero-ops web, less RAM |
| **Tier C — Production-grade** | **$27** | Droplet or App Platform | DO Managed Postgres Basic | when DB crosses 400 MB or you want PITR |

### Tier A — single droplet, self-hosted Postgres

| Line | Cost |
|---|---|
| Basic Regular 1 GB / 1 vCPU droplet | $6 |
| Spaces backups (pg_dump nightly) | $5 |
| **Total** | **$11** |

Next.js + Postgres + Nginx via docker-compose on one box. Works, but:
- One machine = one failure point. Host reboot = Universe down until it's back.
- Postgres and Next.js share 1 GB RAM. Slow query can push app into swap.
- Manual backup restore testing (your cron pg_dump is the safety net).
- Manual Postgres major-version upgrades.

Don't pick this for anything that touches money. Listed for completeness.

### Tier B — **recommended for 20 users**

Two flavours at the same price — pick by ops preference.

**B (droplet, primary)** — self-hosted on a Basic 2 GB droplet + Managed PG:

| Line | Cost |
|---|---|
| Basic Regular 2 GB droplet (1 vCPU, 2 GB, 50 GB SSD, 2 TB transfer) | $12 |
| Managed Postgres Dev tier (`db-s-dev-database`, 512 MB / 10 GB) | $7 |
| **Total** | **$19** |

Deploy: [`deploy/README.md`](./deploy/README.md) — systemd + Caddy + CI.

Pros vs App Platform: **twice the RAM** (2 GB vs 1 GB), full SSH, 50 GB SSD, flexibility for future Ollama/background experiments.
Trade-off: ~2–3 hours of one-time ops setup (provision.sh automates most of it).

**B-alt (App Platform)** — managed web service, same price:

| Line | Cost |
|---|---|
| App Platform `basic-xs` (1 vCPU / 1 GB) | $12 |
| Managed Postgres Dev tier (`db-s-dev-database`, 512 MB / 10 GB) | $7 |
| **Total** | **$19** |

Deploy spec: [`.do/app.minimal.yaml`](../.do/app.minimal.yaml)

Pros vs droplet: zero ops on the web tier — auto TLS, auto restart, git-push deploys built in.
Trade-off: 1 GB RAM instead of 2 GB; no SSH.

Both share the same Managed Postgres Dev tier, which is a real managed DB:
- Daily snapshots, managed upgrades, monitoring dashboard
- No HA (single node) — on failure, ~60s reboot
- No PITR (snapshots only; up to 1 day of data loss in worst case)
- 512 MB RAM, 10 GB storage — fits <500 MB working set year-1

### Tier C — production-grade managed

| Line | Cost |
|---|---|
| App Platform `basic-xs` | $12 |
| Managed Postgres Basic (`db-s-1vcpu-1gb`, 1 GB / 10 GB) | $15 |
| Spaces (5 GB creative assets, optional) | $5 |
| **Total** | **$27** (or $32 with Spaces) |

Deploy spec: [`.do/app.yaml`](../.do/app.yaml)

What the extra $8/mo buys over Tier B:
- Point-in-time recovery (any second in the last 7 days)
- 1 GB Postgres RAM — more breathing room for the dashboard queries
- HA option (add a standby node at extra cost if needed)

Move here when:
- DB crosses ~400 MB (approaching Dev tier's comfortable ceiling)
- You're feeling nervous about snapshot-only recovery
- You add Marketing / Meta Ads ingest (DB growth spikes)

---

## What actually constrains you at 20 users

User count isn't the bottleneck — what's loaded into RAM is.

| Stack running on `basic-xs` | RAM used | OK? |
|---|---|---|
| Next.js baseline | ~300 MB | yes |
| + Razorpay ingest + MIS dashboards | +negligible | yes |
| + Tasks + Marketing modules | +50 MB | yes |
| + Chat with 20 concurrent websockets | +100 MB | yes, comfortable |
| + Memory vault browser | +30 MB | yes |
| **Full stack, 20 concurrent users** | **~500 MB** | **yes (on 1 GB)** |

The full module stack fits in `basic-xs` (1 GB) comfortably. `basic-xxs`
(512 MB) is NOT enough once chat lands.

---

## When to scale up

Specific thresholds, in order of likelihood:

1. **Postgres Dev → Basic ($7 → $15/mo)** when DB crosses ~400 MB or when
   you want point-in-time recovery. Trigger: usually when Meta/Google Ads
   ingest lands and `ad_insights_daily` fills up. Estimated 3–6 months away.
2. **Web `basic-xs → basic-s` ($12 → $25/mo)** when the Revenue dashboard
   regularly loads >500 ms, or RAM sticks above 70%. Not close at 20 users.
3. **Postgres Basic → 2 vCPU / 4 GB ($15 → $60/mo)** when the `payments`
   table crosses ~5M rows OR you have ads + agent activity indexing hot.
   Years away at payment-volume pace.
4. **Add Managed Redis ($15/mo)** when you wire up BullMQ background jobs
   for the agent service, the chat mirror to Slack, or scheduled content
   publishes.
5. **Web `basic-s → basic-m` ($50/mo)** only if chat grows beyond ~100
   concurrent users (5x your current team).

---

## LLM costs dominate infrastructure, eventually

At agent-service scale (50–100 agent runs/day):

| Routing strategy | Monthly LLM spend |
|---|---|
| All Claude (no routing) | $150–300 |
| Hybrid via LiteLLM (70% Groq/Together for open models + 30% Claude) | **$50–80** |
| Self-hosted Ollama on DO GPU droplet | $700–2,100 (GPU rent) |

The hybrid-routing architecture is why. Skip self-hosted Ollama until your
LLM bill crosses ~$500/mo AND you're keeping a GPU hot 24/7.

Note that Groq/Together API calls for open models are *inference providers*,
not hosting — they're called like any LLM API and don't count as "vendor
complexity" the way hosting a separate database would.

---

## Recommended answer

**Tier B — $19/mo — `.do/app.minimal.yaml`**

Full Universe stack for 20 users, single vendor (DigitalOcean), real managed
Postgres with daily snapshots. Upgrades to Tier C in the dashboard when DB
grows — no code changes, no migrations.

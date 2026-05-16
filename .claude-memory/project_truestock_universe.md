---
name: Truestock Universe project
description: Internal platform for Truestock (code name "Skynet") — MIS + AI marketing agents + Asana-style task management; deployed on DO droplet 206.189.141.160 (BLR1, 1vCPU/2GB)
type: project
originSessionId: 657e1362-c2be-41a4-bf0e-667f426f9041
---
**Code name: "Skynet."** Confirmed 2026-05-07 — Amit refers to the project as Skynet internally; "Truestock Universe" is the formal name. Both refer to the same thing.

Truestock Universe is an internal platform Amit's firm (Truestock) is building. Three modules in scope:
1. **MIS tool** — management dashboards / KPIs for the firm.
2. **Marketing engine** — AI agents handling social media content marketing (organic) and performance marketing across Meta and Google Ads.
3. **Task management** — Asana-style project/task planning for internal teams.

**Truestock sells multiple fintech SaaS products. Product line of record (2026-04-19):**
- **Stock Bee — LIVE.** Plans: Swift Pro (Monthly) ₹299 (₹199 legacy grandfathered), Turbo Edge (Monthly) ₹999, Stock Bee Turbo (Monthly) ₹3,999. New yearly plans ₹2,000 and ₹6,999.
- **Bloom — LIVE.** Plans: FinX Bloom Rise (Monthly) ₹1,999 (+ ₹1,999.60 GST variant; legacy ₹999), Bloom Rise ₹4,999, FinX Bloom Prime (Monthly) ₹4,999, FinX Bloom Elite (Monthly) ₹9,999.
- **High — on the verge of Live, not yet selling via Razorpay.** Keep product row, no active mappings.
- **Axe Cap — on the verge of Live, not yet selling via Razorpay.** Same.

Revenue scale per Apr 2026 workbook: ~₹13.6L over 14 months across 1,039 payments. Refund rate ~11%.

**Product is a first-class cross-cutting dimension** — every task, every inflow (revenue/subscription), and every marketing expenditure must be tagged with one of these products. MIS dashboards, marketing dashboards, and reports all need to slice by product. Top-level product filter is expected in the UI. **How to apply:** when designing schemas, dashboards, agents, or workflows, always include `product_id` (FK to products table) on tasks, campaigns, ad sets, content items, transactions, and metrics_daily. Default UI filter is "All products"; per-product views are first-class.

**Razorpay product attribution is plan-name primary, amount fallback.**
Reason: ₹4,999 maps to three different Bloom plans (Rise/Prime/Elite) and ₹999 was both Stockbee Turbo Edge and early Bloom Rise — amount alone is ambiguous. The matcher uses `subscription.plan.item.name` (case-insensitive exact) when present and falls back to amount (±100 paise tolerance for GST rounding). Payments tagged to a subscription inherit the subscription's product attribution directly.

Scale: internal team only, under ~20 people.
**Code name: "Skynet"** (page title `Skynet · Truestock Universe`).
**Deployment: DO droplet `206.189.141.160` (BLR1, 1vCPU/2GB), Caddy reverse proxy → Next.js (App Router, RSC + ISR). Plain HTTP, `noindex` set, no TLS yet.**

**Build state as of 2026-05-08 (verified by HTTP probe of the droplet):**
- **Live with real UI, empty data:**
  - `/mis/revenue` — "MIS v0.1 · Razorpay slice". MRR/ARR cards, today / 7d / MTD strips, by-product breakdown, recent-payments table, "All products" filter, manual add + bulk import affordances. All ₹0 — empty state prompts "Set up the Razorpay webhook (or run a sync) to get data flowing."
  - `/tasks` — list + board view, statuses Backlog → To do → In progress → Review → Done → Cancelled, with assignee/project/priority/due. One open task: "Set up Google SSO with Auth.js v5" (due 14 May, Amit, Backlog, high).
  - `/projects` — one project ("Skynet (internal) — cross-cutting platform work for the Universe build itself"), create-project form with slug/product/color/description.
- **Auth:** logged-in shell exists (header shows `aks@truestock.in`), but real Google SSO is still a backlog task — current auth is a stub/dev shim.
- **Stubbed / "Coming soon" in nav (greyed out, non-clickable):** Pulse, Chat, Marketing, Products, Memory Vault, Agents, Team, Members, Mobile companion, Workspace settings.

**How to apply:** when proposing work, treat MIS / Tasks / Projects as live surfaces to extend (not greenfield), and the rest as still-to-build. The first unblocking work for MIS is wiring the Razorpay webhook → payments table; the first unblocker for the platform broadly is real Google SSO (Auth.js v5).

**Positioning:** Amit frames Universe as "the core engine that runs the company," not just a productivity tool. Reliability, observability, and agent governance are first-order concerns, not polish items.

**Stack decisions locked so far (2026-04-19, updated 2026-05-07):**
- Hosting: **DigitalOcean droplet** (revised from App Platform). Active droplet: `ubuntu-s-1vcpu-2gb-blr1` at **206.189.141.160** (private VPC IP `10.47.0.9`), Bangalore, $12/mo. Created Apr 19, scaffolded Apr 20, then dormant. State as of 2026-05-07: Caddy 2.11.2 running default page on `:80`, Node 22.22.2 + npm + python3 + postgresql-client-14 (client only, no server), `truestock` Linux user created, no app deployed, no domain pointed, no HTTPS, no crontabs, no Docker. App code IS present at `/opt/truestock-universe` (cloned from `github.com/aksonairbot/truestock-universe`, default branch `main`); pnpm install succeeded but `pnpm build --filter=web` failed Apr 20 on a Next 15 server-action type error in `apps/web/app/admin/payments/import/page.tsx` — fixed in commit `db3ea97` on 2026-05-07. Original App Platform plan ($19–27/mo) is deprioritised; droplet path was chosen for cost and control. **Trade-off:** ops work (deploys, systemd, OS patching) is now on us; not free like App Platform was.
- Monorepo layout: pnpm workspace + Turborepo. `apps/web` (Next.js 15.5), `packages/db` (Drizzle), `packages/razorpay`. Build command is `pnpm build --filter=web`. Drizzle scripts: `pnpm db:generate|push|migrate|seed|studio`. Razorpay backfill: `pnpm razorpay:backfill`.
- LLM strategy: **hybrid routing**. Frontier models (Claude, GPT) for hard reasoning/judgment; open models on **Ollama** (Hermes, Gemma, and similar) for high-volume cheap jobs (classification, summarisation, extraction, drafting-at-volume). Goal: minimise token spend.
- **Episodic memory vault + internal wiki** required to reduce repeated code/context re-reads by agents. Treat as core infra, not a stretch feature.
- **Auth: Google SSO (Workspace) from day one.** Email-domain restricted to truestock.in. Roles: Admin, Manager, Member, Viewer, Agent (agents are first-class users). Invite-by-email flow required in v1.
- **Mobile: React Native + Expo companion app** (iOS + Android, one codebase, shared types with the Next.js web). Scope is intentionally narrow: approvals queue, notifications, tasks (My Week), Pulse glance — heavy editing stays on web.
- **In-app chat + Slack mirror.** Slack-style native chat inside Universe (channels per project/campaign, DMs, threads, @mentions of humans AND agents), mirrored to Slack so notifications hit existing phones. Agents are first-class chat participants — @-mention an agent in a channel and it replies with its work.
- **Manager view: Team page + per-person profiles.** Managers see a team dashboard with per-person velocity (tasks closed, agent approvals, hours) plus click-through activity timelines. Not a general-purpose audit log — curated for management.
- **Privileges: per-module access matrix.** Each user's role is set independently per module (Pulse, Chat, Marketing, Tasks, MIS, Memory Vault, Agents, Members). Finance-like sensitivity defaults to Admin/Manager only. Project-level overrides are a later phase.

**How to apply:**
- When proposing infra/services, default to DO-native. Cost models use DO pricing.
- When proposing an agent or task, explicitly pick the model tier (frontier vs. open/local) and justify — don't assume Claude everywhere.
- When proposing agent workflows, route code/context access through the memory vault/wiki, never raw file reads if it can be avoided.

**Why:** Amit's framing is "MIS + marketing engine + task manager" as one platform, not three separate tools — so cross-module integration (e.g., marketing campaign tasks flowing into the task manager, ad spend flowing into MIS) is part of the value prop, not a stretch goal.

**How to apply:** When suggesting features, integrations, or architecture decisions, prefer designs that let the three modules share users, auth, and data (single Postgres, shared event bus). Avoid recommending three disjoint SaaS tools unless explicitly asked.

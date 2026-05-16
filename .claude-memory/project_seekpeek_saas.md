---
name: SeekPeek product + SaaS plan
description: Skynet was renamed SeekPeek as the customer-facing product name. Amit wants to evolve it from internal Truestock tool into a multi-tenant SaaS competing with monday.com / Asana, with a Flutter mobile app. 5-stage roadmap drafted 2026-05-12; wedge decision pending.
type: project
originSessionId: af1ae56c-680a-4e5e-ae65-1362283a0992
---
**Product naming.** Internal code name: Skynet. Customer-facing brand: **SeekPeek** (sub-brand of Truestock). The /welcome landing page and sidebar already wear the SeekPeek name. Existing project rows + GitHub repo + DO droplet path (/opt/truestock-universe) keep the Skynet codename — that's internal infra, not customer-facing.

**Amit's directive (2026-05-12 evening):** turn SeekPeek into a sellable AI-driven task management product that any company can buy. Includes a Flutter Android + iOS app. He explicitly cited monday.com and Asana as the comp.

**The wedge decision is still open.** Three options I framed; Amit hasn't picked yet. The wedge shapes everything downstream (pricing, marketing copy, what to build first):

- **A. AI-coached, anti-surveillance for 5–50-person startups.** RECOMMENDED. Leans into what's already shipped (bento dashboards, coach-tone AI narratives, private streaks, anti-leaderboard stance). $8/seat/month. Break-even ~15 customers. Clearest positioning vs incumbents and consistent with the locked anti-features (no public productivity scores, no badges, no surveillance).
- **B. Visual-first, design-led** (Notion/Linear taste-driven crowd). $10/seat/month. Leans into Higgsfield cosmic posters + motion polish as the actual selling point. Smaller addressable market.
- **C. Vertical for Indian fintech / SaaS startups.** Razorpay integration + compliance dashboards baked in. $15–25/seat/month. Sells to Truestock-network firms. Smallest market, lowest CAC.
- Hybrid was offered too: A as core + C as paid add-on for Indian fintech buyers.

**How to apply:** When Amit picks the wedge, lock it in this file. Until then, the multi-tenancy refactor (Stage 1) works for all three so it's safe to start without the decision.

**5-stage roadmap (drafted 2026-05-12). Realistic timeline: 5–6 months with 1 senior eng + 1 designer, OR 9–12 months solo + Claude.**

1. **Stage 1 (weeks 1–2): Multi-tenancy plumbing.** Add `organizations` table + `organization_id` on every scoped row (users, projects, tasks, comments, notifications, daily_briefings, project_summaries, ai_dashboards). Migrate existing Truestock data into a default org. Update every server action to scope by current user's org. Add a tiny org-switcher in the sidebar. Without this, nothing else can ship safely.
2. **Stage 2 (weeks 3–4): Sign-up + onboarding + billing.** "Create your organization" flow on /welcome. First user becomes admin, picks org name + workspace slug. Invite-by-email seats. Stripe per-seat billing ($8/seat/mo, free up to 5 users). Plan gates on AI usage (free tier capped at ~50 LLM calls/month). Custom branding: org logo, primary color.
3. **Stage 3 (weeks 5–8): Public REST API + JWT auth.** Endpoints for tasks / projects / comments / notifications / briefings / dashboards at /api/v1/*. Bearer JWT for mobile, API keys for org-level integrations. Rate limiting per org. OpenAPI spec. This is what the Flutter app will call.
4. **Stage 4 (weeks 9–14): Flutter mobile app (Android + iOS).** Single codebase. **UI COMPLETE as of 2026-05-17** — 19 Dart files, 5 screens (Home/Tasks/QuickCapture/Chat/Profile), full dark+light theme, GoRouter+Riverpod. Located at ~/Documents/Claude/Projects/Superman/seekpeek_mobile/. Needs: Flutter SDK install on Mac Mini (setup script ready), then wire to REST API (Stage 3), add FCM/APNs notifications, Google OAuth.
5. **Stage 5 (weeks 15–20): Marketing site + first 10 customers.** seekpeek.com — public site, docs, blog, pricing, customer logos. Onboarding email sequence. Founder-led sales — direct outreach to Amit's network of 5–50-person startups. Goal: 10 paying customers (~$1k MRR) by end of week 20. That's the real signal product-market fit exists.

**State of the app as of 2026-05-12 evening (before Stage 1 starts):**
- 13 demo users, 7 projects, ~130+ closed tasks across last 30 days (after seed-activity SQL run). Comments, subtasks, notifications, briefings, dashboards all real.
- Live surfaces on http://206.189.141.160: /, /welcome, /tasks, /tasks/[id], /projects, /projects/[slug], /members, /members/[id], /notifications, /me/week, /me/month, /tasks/new.
- AI surfaces (all running through Ollama qwen3:8b on Monk droplet via VPC): task triage on /tasks/new, quick capture on /, morning briefing + EoD reflection cards on /, "Break it down" subtask AI on slide-over, project health summary on /projects/[slug], weekly + monthly bento dashboards with pattern-aware AI narrative.
- Auth: stub mode (everyone hits seeded admin Amit). NextAuth v5 Google OAuth wired but dormant until Amit creates Google Cloud Console credentials + sets AUTH_SECRET / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in /opt/truestock-universe/.env. See SEEKPEEK-GOOGLE-AUTH-SETUP.md in workspace.
- Higgsfield posters: 8 surreal-cosmic figure-led images shipped as project banners + daily hero + celebration card.
- All deploys are managed via patch + scp + git am scripts in ~/Documents/Claude/Projects/Superman/. Master deploy script at skynet-deploy-all.sh.

**Locked design rules carry forward into SaaS:**
- Anti-leaderboards, anti-public-productivity-scores, anti-badges, anti-motivational-AI-cheerleading. These ARE the marketing for Wedge A — lean into them.
- Coach-tone AI prompts (specific, data-aware, max 3 sentences, no exclamation points, no cheerleading) across briefing / dashboard / project summary.
- Asana-style interaction model on the existing Skynet dark palette.

**Open decisions for next session (in order of unblocking power):**
1. Pick the wedge (A / B / C / Hybrid). Affects pricing, marketing copy, and which features to prioritize.
2. Pick the pace (founder pace 9–12mo / hire-mode 5–6mo / side-project no-timeline).
3. Approve starting Stage 1 (multi-tenancy refactor) — Claude suggested yes, can start without the wedge decision since the schema work is wedge-agnostic.

**Patch backlog at session end (some may be deployed already; check droplet git log):**
- skynet-deploy-all.sh master deploy
- skynet-deploy-data-fill.sh (rich activity seed + Today nav fix)
- skynet-deploy-bento-v2.sh (expanded 13-cell bento with patterns + AI pattern-narrative)
- skynet-fix-tables.sh / skynet-fix-tables.sql (psql migration for tables drizzle:push couldn't apply non-interactively)

**Schema fact discovered the hard way:** drizzle-kit `drizzle:push` requires a real TTY for its interactive confirmation. `echo y |` doesn't satisfy it. For all future schema changes, write plain SQL files and apply via `psql "$DATABASE_URL" -f path.sql` instead of going through drizzle-kit. Idempotent CREATE TABLE IF NOT EXISTS + DO blocks for enum duplicates. The pattern is in skynet-fix-tables.sql.

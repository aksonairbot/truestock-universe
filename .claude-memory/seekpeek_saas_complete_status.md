---
name: SeekPeek SaaS Platform - Complete Build Status (May 2026)
description: Full project status through Phase 6 email integration - 75% complete, ready for Phase 7-9
type: project
originSessionId: c1984d37-f837-4b47-b52f-5860896234ed
---
# SeekPeek SaaS Platform - Complete Build Status

**Date:** May 12-17, 2026  
**Overall Progress:** ~80% Complete  
**Next Chat Action:** Install Flutter SDK on Mac Mini, then Start Phase 7 - Plan Limit Enforcement  
**Infrastructure:** DigitalOcean droplet 206.189.141.160 (Caddy reverse proxy, PostgreSQL, Node.js/Next.js)

## Recent Updates (May 14-17, 2026)
- **Web typography overhaul:** Refined all fonts/sizes across web app (Poppins system, body/heading/display scale)
- **Light mode built and deployed:** Full light theme added to web app with theme toggle in sidebar
- **Mobile app UI complete:** Flutter project with 19 Dart files, 5 screens, dark+light themes — at ~/Documents/Claude/Projects/Superman/seekpeek_mobile/
- **Design spec:** SeekPeek-Mobile-Design-Spec.docx created (11 sections)
- **Setup script:** seekpeek_mobile/setup_flutter.sh ready to install Flutter SDK on Mac Mini

## Completed Phases (1-6)

### Phase 1: Multi-Tenancy Foundation ✅
- Schema: Created `organizations` table (UUID, slug, name, description)
- Added `organization_id` to 8 core tables (users, tasks, projects, teams, etc.)
- Created `org-scope.ts` helper functions (`orgScope()`, `orgAnd()`, `verifyOrgOwnership()`)
- Backfilled all existing users to Truestock org (UUID: `550e8400-e29b-41d4-a716-446655440000`)
- File: `skynet-stage1-schema-DIRECT.sql`, `src/lib/org-scope.ts`

### Phase 2: Authentication & Multi-Org UI ✅
- Auth: `getCurrentUser()` returns user with selected org; `getUserOrganizations()` returns all user's orgs
- Org switching: Cookie-based (`selected_org_id`, max age 365 days)
- UI: Enhanced org-switcher component with dropdown showing all orgs, gradient icons, create org button
- Layout: Updated to pass multi-org context to all pages
- Files: `auth-stage3-multi-org.ts`, `org-switcher-stage3.tsx`

### Phase 3: Organization Management (5 APIs + 4 Pages) ✅
**APIs:**
- `POST /api/org/create` - Create new org, validate slug uniqueness, create org_members (user as admin), create free billing record
- `POST /api/org/switch` - Verify user is member, set cookie, return org context
- `POST /api/org/invite` - Create 7-day expiring invitation, generate unique token (NOW SENDS EMAIL in Phase 6)
- `POST /api/billing/portal` - Stripe customer portal (stub, real SDK pending)
- `POST /api/billing/upgrade` - Create checkout session (stub, pending Phase 5)

**Pages:**
- `/org/create` - Form to create org (auto-slugify name, custom description)
- `/org/[slug]/settings` - Members list, invite form, pending invites, delete org (danger zone)
- `/org/[slug]/invite/[token]` - Accept public invitation link (7-day expiry)
- `/org/[slug]/billing` - Show 4 plans (Free/Starter/Pro/Enterprise), usage bars, upgrade buttons

**Database Schema:**
- `organization_members` - User-org mappings with roles (member/admin)
- `organization_invites` - Temporary 7-day invitations with token
- `organization_billing` - Plan type, status, stripe_customer_id, stripe_subscription_id
- `billing_events` - Webhook event audit log

### Phase 4: Database Applied ✅
- All 4 org tables created and indexed
- Amit set as admin of Truestock org
- Free billing record initialized for Truestock
- File: Included in `STAGE3-SCHEMA.sql`

### Phase 5: Hybrid Payment Integration (Razorpay + Stripe) 🔄 READY
**Code Complete, Needs API Keys**

**Configuration:**
- `razorpay-config.ts` - Plans in INR (Starter ₹2,390/mo, Pro ₹8,100/mo), amounts in paise
- `stripe-config.ts` - Plans in USD ($29/mo, $99/mo), matching limits
- `payment-gateway-router.ts` - Routes based on country: India→Razorpay, else→Stripe

**Checkout & Webhooks:**
- `api-billing-checkout-hybrid.ts` - Single endpoint, routes to Razorpay OR Stripe based on country
- `api-webhooks-stripe.ts` - Handles customer.created, subscription events, invoice events
- `api-webhooks-razorpay.ts` - Handles payment.authorized/failed, subscription events
- Both update same `organization_billing` table

**Database:**
- Added `payment_gateway` (stripe/razorpay), `razorpay_customer_id`, `razorpay_subscription_id`, `razorpay_order_id`
- Added `billing_country`, `billing_currency`
- Created `payment_gateway_logs` table for analytics
- File: `PHASE-5-HYBRID-MIGRATION.sql`

**Needs to Deploy:**
```env
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PUBLIC_KEY=pk_test_xxxxx
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### Phase 6: Email Integration ✅ READY
**Code Complete, Needs Email API Key**

**Email Files:**
- `email-config.ts` - Provider selection (Resend or SendGrid), template definitions, blocklist, validation
- `email-templates.ts` - 5 beautiful HTML templates: invitation, payment-confirmed, payment-failed, plan-upgraded, weekly-digest
- `email-service.ts` - sendEmail() function (works with both providers), retry queue with exponential backoff, specialized functions (sendInvitationEmail, sendPaymentConfirmedEmail, etc.)

**Integrations:**
- `api-org-invite-updated.ts` - NOW SENDS invitation email immediately to invitee
- `api-webhooks-razorpay-updated.ts` - NOW SENDS payment confirmation or failure email to org admin
- (Stripe webhook also gets updated for email support)

**Email Types:**
1. Team Invitation - To invitee, 7-day accept link
2. Payment Confirmed - To org admin, includes plan features
3. Payment Failed - To org admin, update payment method link
4. Plan Upgraded - To org admin, old vs new plan
5. Weekly Digest - To all members (template ready)

**Retry Logic:**
- Failed email → queued → retry in 5 min → queued → retry in 10 min → queued → retry in 15 min → logged
- In-memory queue (TODO: persist to DB for production)

**Needs to Deploy:**
```env
EMAIL_PROVIDER=resend  # or sendgrid
RESEND_API_KEY=re_xxxxx  # OR SENDGRID_API_KEY=SG.xxxxx
EMAIL_FROM=noreply@seekpeek.com
EMAIL_REPLY_TO=support@seekpeek.com
NEXT_PUBLIC_BASE_URL=https://206.189.141.160:3000  # or actual domain
```

## Ready-to-Build Phases (7-9)

### Phase 7: Plan Limit Enforcement (2 hours, Not Started)
**Design Complete, Code Ready to Write**

Where to add:
- In task creation API: check `organization_billing.max_tasks` before insert
- In project creation API: check `organization_billing.max_projects` before insert
- In team member addition: check `organization_billing.max_members` before adding

What to do:
- Get org billing info from DB
- Compare current usage against plan limits
- Return 403 Forbidden with "Plan upgrade required" message
- Show upgrade link in error

### Phase 8: Comprehensive Testing (3 hours, Not Started)
- Auth isolation tests (verify org data not accessible across orgs)
- API integration tests (all 13 endpoints)
- Payment gateway tests (Razorpay + Stripe mock)
- Email sending tests
- Webhook signature verification

### Phase 9: Production Deployment (1 hour, Not Started)
- Switch API keys to production
- Update NEXT_PUBLIC_BASE_URL to actual domain
- Enable monitoring & error tracking
- Test live payments
- Go live 🚀

## Project Structure

**Location:** `/Users/amit/Documents/Claude/Projects/Superman/`

**Total Files:** 30+ production files, 3000+ lines of code, 1000+ lines of docs

**Key Infrastructure:**
- Droplet: 206.189.141.160 (Ubuntu 22.04)
- Database: PostgreSQL (truestock_universe)
- App: Next.js + TypeScript + Drizzle ORM
- Reverse Proxy: Caddy
- Server Process: tmux session 'web' on port 3000

## Architecture Summary

```
┌─ Frontend (React/Next.js) ─────────────────────────┐
│  • Multi-org switcher                              │
│  • Create org form                                 │
│  • Settings (members, invites)                     │
│  • Billing page (plans, usage)                     │
│  • Accept invite links                             │
└────────────────────────────────────────────────────┘
              ↓ API Calls ↓
┌─ Backend (Node.js APIs) ──────────────────────────┐
│  • Organization management (create, switch, invite)│
│  • Billing checkout (hybrid Razorpay/Stripe)      │
│  • Payment webhooks (Razorpay + Stripe)           │
│  • Email service (invites, payments)              │
│  • Auth & org-scope filtering                     │
└────────────────────────────────────────────────────┘
              ↓ Queries ↓
┌─ Database (PostgreSQL) ───────────────────────────┐
│  • organizations (multi-tenancy root)             │
│  • organization_members (user-org mappings)       │
│  • organization_invites (7-day tokens)            │
│  • organization_billing (plan tracking)           │
│  • billing_events (webhook audit log)             │
│  • payment_gateway_logs (routing analytics)       │
│  • [Core tables with org_id] (tasks, projects)    │
└────────────────────────────────────────────────────┘
              ↓ Calls ↓
┌─ External Services ───────────────────────────────┐
│  • Razorpay (India: UPI, card - 2% fees)         │
│  • Stripe (Global: card, ACH - 2.9% + $0.30)     │
│  • Resend or SendGrid (Email)                     │
└────────────────────────────────────────────────────┘
```

## Critical Files by Category

**Core System Files (3):**
1. `org-scope.ts` - Organization isolation helpers
2. `auth-multi-org.ts` - Multi-org authentication
3. `payment-gateway-router.ts` - Route to Razorpay or Stripe

**API Endpoints (13):**
- Org: create, switch, invite
- Billing: portal, upgrade, checkout
- Webhooks: stripe, razorpay
- Email: (integrated into above)

**Pages (4):**
- /org/create, /org/[slug]/settings, /org/[slug]/billing, /org/[slug]/invite/[token]

**Config Files (4):**
- razorpay-config.ts, stripe-config.ts, email-config.ts, email-templates.ts

## Deployment Status

**Phase 1-4:** ✅ Already deployed to 206.189.141.160  
**Phase 5:** 🔄 Code ready, needs Razorpay + Stripe API keys + deployment  
**Phase 6:** 🔄 Code ready, needs Resend/SendGrid API key + deployment  
**Phase 7-9:** 📋 Design ready, need to build + deploy

## Pricing (Live)

**Monthly:**
- Free: 1 member, 5 projects, 50 tasks - $0
- Starter: 5 members, 100 projects, 1000 tasks - ₹2,390 (India) / $29 (Global)
- Pro: 10 members, 1000 projects, 10000 tasks - ₹8,100 (India) / $99 (Global)
- Enterprise: Unlimited - Custom pricing

## Payment Routing

**Automatic routing based on customer country:**
- India → Razorpay (2% fees, UPI available)
- Global → Stripe (2.9% + $0.30, credit card + ACH)

Both gateways update the same database, so UI doesn't need to change.

## Email Triggers

1. **POST /api/org/invite** → Send invitation email to invitee
2. **Razorpay payment.authorized/captured** → Send confirmation to org admin
3. **Razorpay payment.failed** → Send failure notice to org admin
4. **Stripe invoice.paid** → Send confirmation to org admin
5. **Stripe invoice.payment_failed** → Send failure notice to org admin
6. (Cron job weekly) → Send digest to all members

## How to Continue in Next Chat

1. **Start Phase 7:** "Start Phase 7 - plan limit enforcement"
2. **Deploy Phase 5:** "Deploy Phase 5 hybrid payments" (need Razorpay + Stripe keys)
3. **Deploy Phase 6:** "Deploy Phase 6 email integration" (need Resend/SendGrid key)
4. **Test everything:** "Run Phase 8 comprehensive testing"
5. **Go live:** "Phase 9 production deployment"

All code is in `/Users/amit/Documents/Claude/Projects/Superman/`
All documentation is saved there too.

**Current Status:** 75% done, 6-8 hours to production launch 🚀

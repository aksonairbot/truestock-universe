---
name: SeekPeek landing page architecture
description: Landing page at /welcome — full marketing page with hero, mockup, features, CTA; CSS in globals.css with .lp-* prefix
type: project
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
SeekPeek landing page lives at `apps/web/app/welcome/page.tsx` with supporting components:
- `welcome/sign-in-button.tsx` — variants: nav, primary, hero, default (Google OAuth)
- `welcome/marquee.tsx` — client component with scrolling feature pills

CSS uses `.lp-*` prefix classes in `globals.css` (replaces old `.wlc-*` block). Key sections:
- Sticky nav with backdrop blur
- Hero with 3D animated brand icon + floating feature pills
- Marquee strip (lpMarquee keyframes)
- Showcase with app mockup matching real product (cosmic banner, floating stat cards, AI briefing cards)
- 4-card features grid
- 3-step "how it works" flow
- CTA with gradient glow
- Footer

Responsive breakpoints at 960px and 640px. The mockup section mirrors the actual product dashboard design (sidebar nav items, cosmic gradient banner, stat cards).

**Why:** First marketing landing page for SeekPeek SaaS — designed May 2026.

**How to apply:** When updating the landing page, the mockup should continue to reflect the real product UI. If new features are added to the product sidebar or dashboard, update the mockup to match.

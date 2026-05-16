---
name: Performance marketing agent spec (Apr 2026)
description: Internal requirements doc that pins what the Ad Operator + Analyst agents need to run Meta Ads performance marketing end-to-end
type: reference
originSessionId: 657e1362-c2be-41a4-bf0e-667f426f9041
---
Amit shared `AI_Agent_Performance_Marketing_Requirements.docx` on 2026-04-19 — an internal 11-section spec for the Meta Ads performance marketing agent. The original lives in the user's uploads; a distilled copy lives at `Superman/truestock-universe/docs/perf-marketing-requirements.md`.

**The 11 requirement areas, ordered by how load-bearing they are:**
1. **Events tracking (SHOW-STOPPER).** Meta Pixel + CAPI with dedup + EMQ ≥ 6, GA4 with goals, UTMs on every URL, fixed attribution window. Agent must verify events firing before any campaign goes live and alert on event drops.
2. **Scope.** Objective, monthly revenue/lead target, target CPA/ROAS, time horizon, markets, products in scope, budget, explicit out-of-scope list.
3. **Product knowledge.** Inner (features/USP/pricing/FAQs/limits/testimonials) + outer (positioning/brand voice/TG/geo/seasonality) — lives in the Memory Vault (Cabinet) per-product.
4. **Campaign strategy.** TOFU/MOFU/BOFU with 15/25/60 budget split, core + custom + LAL audiences with exclusions for converters, max +20% budget change every 2–3d, A/B test ONE variable at a time, min 7d or 50 conversions per variant.
5. **Metrics.** Primary: ROAS, CPA, CPL, CVR, Revenue. Delivery: CTR, CPC, CPM, Frequency, Thumb Stop Rate, Hook Rate, Video View Rate. Funnel: ATC/Checkout/Purchase/LP conv. Cadence: daily (spend/pacing/anomalies), weekly (CPA/ROAS/freq/rotate), monthly (full review).
6. **Change triggers (crisp).** Creative refresh: CTR −25–30% WoW, freq > 3–4 on cold, CPA +20% unexplained, hook rate < 15%. Ad set: audience < 500k, segment CPA 2× others, LAL exhausted. Budget: scale +15–20% only after ROAS above target 5 days AND not in learning phase.
7. **Creative generation.** Static, Video, Carousel, Story/Reel, Collection, Lead Form, Dynamic/Catalogue — needs brand kit, per-placement specs, brief templates, ≥3 copy variants per ad set, CTA mapping, hooks library.
8. **Data analysis.** Segment by campaign/adset/ad/placement/device/age/gender; scale winners, kill losers, detect creative fatigue, reconcile Meta vs GA4 vs CRM, cohort + incrementality thinking.
9. **Market trends.** Google Trends for the category, seasonality, Meta CPM benchmarks, trending content formats (e.g. Reels > static for reach in 2026), platform policy changes.
10. **Competitor analysis.** Meta Ad Library (free), Semrush/Ahrefs, SimilarWeb, manual weekly audit. Strategy: find unused angles, test contrarian messages, benchmark CPA/ROAS.
11. **Guardrails (NEVER without human approval):** change monthly cap, change campaign objective (resets learning), add new audiences outside strategy, any change during a sale/launch/high-stakes window. Plus: hard daily/weekly/monthly spend caps, CRM access for custom audiences + lead quality loop, LTV-informed CPA targets, decision log for every action, automated weekly summary, policy-compliance pre-check before publish.

**How to apply:**
- When designing agents or schemas for the marketing module, cross-check against this spec — don't invent requirements that contradict it.
- The spec is the source of truth for change thresholds and guardrails; use exact numbers (−25% CTR, +20% budget, freq > 3–4, min 7d/50 conv) rather than rounding or re-inventing.
- Product knowledge lives per-product in the Memory Vault (Cabinet) — `vault/products/<slug>/{inner.md, outer.md, faqs.md, testimonials.md}` — agents read from there, not from ad hoc prompts.
- Ingestion order implied by this spec: **tracking → ad spend/performance data → agent actions**. Don't build the agents before the data pipe is solid.

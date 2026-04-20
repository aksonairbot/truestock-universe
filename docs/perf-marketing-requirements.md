**What an AI Agent Needs to Run Performance Marketing**

Essential Requirements -- Internal Working Document

Date: 18 April 2026

For an AI Agent to independently manage performance marketing on Meta
Ads (or any paid platform), it needs to be equipped with the right
knowledge, data, tools, and decision-making frameworks from day one.
Below are all the essential requirements we have identified --- your
inputs plus additional ones that are critical to make the agent
functional.

1. Product Knowledge
====================

The agent must have a deep understanding of what it is advertising
before it can market it effectively.

Inner Product Knowledge
-----------------------

-   Full product or service description --- features, benefits, use
    cases

-   Unique Selling Propositions (USPs) --- what makes it different from
    alternatives

-   Pricing structure --- tiers, offers, discounts, free trials if any

-   Customer pain points the product solves

-   FAQs and common objections customers raise

-   Product limitations or things it does NOT do (to avoid misleading
    ads)

-   Past customer feedback, testimonials, and reviews

Outer / Market-Facing Knowledge
-------------------------------

-   How the product is currently positioned in the market

-   Brand tone of voice and messaging guidelines

-   Target customer profile --- who the product is built for

-   Geographic and demographic focus markets

-   Seasonal relevance --- does demand spike at certain times of year

2. Ads Assets & Creative Generation
===================================

The agent must be able to generate or brief creatives across every ad
format available on Meta.

Creative Types the Agent Must Handle
------------------------------------

-   Static Image Ads --- single image with headline and body copy

-   Video Ads --- script writing, scene direction, suggested visuals

-   Carousel Ads --- individual card copy + image concept for each card

-   Story & Reel Ads --- short-form vertical video scripts with hook in
    first 3 seconds

-   Collection Ads --- cover creative + product grid copy

-   Lead Form Ads --- form headline, intro text, and question design

-   Dynamic / Catalogue Ads --- template copy that works across product
    variations

What the Agent Needs to Generate Creatives
------------------------------------------

-   Brand guidelines: logo, colour palette, fonts, do\'s and don\'ts

-   Image and video specifications per placement (Feed, Stories, Reels,
    Messenger)

-   A creative brief template it can fill and pass to a designer or
    image-gen tool

-   Headline and copy variants --- minimum 3 per ad set for A/B testing

-   CTA options mapped to objective: Shop Now, Learn More, Get Quote,
    Sign Up, etc.

-   Hooks library --- opening lines proven to stop the scroll

*Note: At a later stage the agent can use image generation tools (e.g.
DALL-E, Midjourney API) to produce image drafts automatically.*

3. Proper Events Tracking
=========================

Without accurate tracking the agent is blind. This is the most critical
technical requirement before the agent can optimise anything.

Client-Side Tracking
--------------------

-   Meta Pixel installed on all pages of the website

-   Standard events firing correctly: ViewContent, AddToCart,
    InitiateCheckout, Purchase, Lead, CompleteRegistration, Contact

-   Custom events defined for any action not covered by standard events

Server-Side Tracking
--------------------

-   Conversions API (CAPI) set up to send events directly from the
    server

-   Event deduplication configured between Pixel and CAPI to avoid
    double counting

-   Event Match Quality (EMQ) score of 6 or above in Meta Events Manager

Analytics Layer
---------------

-   Google Analytics 4 connected to the website

-   UTM parameters added to every ad URL: Source, Medium, Campaign, Ad
    Set, Creative

-   Goal conversions set up in GA4 matching the Meta events

-   Attribution window defined and agreed upon (e.g. 7-day click, 1-day
    view)

What the Agent Checks on Tracking
---------------------------------

-   Verify events are firing before any campaign goes live

-   Alert if a key event stops receiving data (e.g. Purchase event drops
    to zero)

-   Cross-check Meta-reported conversions against GA4 and CRM data
    regularly

4. Scope of the Project
=======================

The agent must know exactly what it is trying to achieve. Vague goals
produce vague results. The scope needs to be defined clearly before the
agent begins any work.

-   Primary business objective: e.g. generate revenue, grow leads, drive
    app installs, increase brand awareness

-   Monthly revenue or lead target the ads are expected to contribute to

-   Target cost per result: e.g. Cost Per Lead under Rs. 200, ROAS of 3x
    or above

-   Time horizon: is this a short sprint campaign or ongoing always-on
    activity

-   Markets in scope: which cities, states, or countries the agent
    should target

-   Products or services in scope: if the business has multiple
    offerings, which ones are being advertised

-   Budget allocated: monthly ad spend limit with clear approval
    thresholds

-   What is out of scope: what the agent should NOT touch or decide on
    its own

*Note: Without a clearly defined scope the agent cannot prioritise
tasks, set bidding strategies, or know when it has succeeded.*

5. Proper Campaign Strategy
===========================

The agent needs a strategic framework to operate within. Strategy
defines how the budget is used, who is targeted, and how the funnel is
structured.

Funnel Structure
----------------

-   Top of Funnel (TOFU) --- Awareness campaigns targeting cold, broad
    audiences

-   Middle of Funnel (MOFU) --- Consideration campaigns for users who
    have engaged

-   Bottom of Funnel (BOFU) --- Conversion campaigns retargeting warm
    audiences

Audience Strategy
-----------------

-   Core audience definitions: demographics, interests, and behaviours
    for each funnel stage

-   Custom audience lists: website visitors, lead form openers, video
    viewers, CRM contacts

-   Lookalike audiences built from best-performing custom audiences

-   Audience exclusions: prevent showing ads to people who have already
    converted

Budget Strategy
---------------

-   Budget split across funnel stages: suggested 60% BOFU, 25% MOFU, 15%
    TOFU

-   Daily vs lifetime budget decision per campaign

-   Scaling rules: increase budget by max 20% every 2 to 3 days to avoid
    disrupting the algorithm

-   Bidding strategy per objective: Lowest Cost, Cost Cap, Bid Cap, or
    Minimum ROAS

Testing Strategy
----------------

-   A/B test one variable at a time: audience OR creative OR copy ---
    never all at once

-   Minimum test duration: 7 days or 50 conversions per variant before
    drawing conclusions

-   Winning variant becomes control, new challenger is tested against it

6. Correct and Measurable Metrics
=================================

The agent must track the right numbers at the right level. Vanity
metrics should never be used to make budget or creative decisions.

Primary Performance Metrics
---------------------------

-   ROAS (Return on Ad Spend) --- revenue generated per rupee spent on
    ads

-   CPA (Cost Per Acquisition) --- cost to get one purchase or
    conversion

-   CPL (Cost Per Lead) --- cost to acquire one lead

-   CVR (Conversion Rate) --- percentage of clicks that result in the
    desired action

-   Revenue Attributed --- total revenue directly linked to the ad
    campaigns

Delivery & Engagement Metrics
-----------------------------

-   CTR (Click-Through Rate) --- measures creative and audience
    relevance

-   CPC (Cost Per Click) --- efficiency of spend in driving traffic

-   CPM (Cost Per 1,000 Impressions) --- cost of reaching the audience

-   Frequency --- average times a user sees the ad; monitor to prevent
    ad fatigue

-   Thumb Stop Rate --- percentage of people who stop scrolling at the
    video ad

-   Hook Rate --- percentage who watch the first 3 seconds of a video

-   Video View Rate --- percentage who watch 25%, 50%, 75%, 100% of the
    video

Funnel Health Metrics
---------------------

-   Add to Cart Rate --- how many clickers are adding to cart

-   Checkout Initiation Rate --- how many cart adds proceed to checkout

-   Purchase Rate --- how many checkouts result in a completed purchase

-   Landing Page Conversion Rate --- percentage of ad clicks that
    convert on the page

Reporting Cadence
-----------------

-   Daily: check spend pacing, CPM, CTR, any anomalies --- pause broken
    ads

-   Weekly: review CPA, ROAS, frequency --- rotate creatives, adjust
    budgets

-   Monthly: full funnel review, audience refresh, creative overhaul
    decisions

7. Proper Analysis of Data
==========================

The agent must not just collect data --- it must interpret it correctly
and translate insights into actions.

-   Segment performance by campaign, ad set, ad, placement, device, age
    group, and gender

-   Identify top-performing audience segments and scale them

-   Identify underperforming ad sets --- pause before they drain budget

-   Creative fatigue detection: if CTR drops more than 30%
    week-over-week, flag for refresh

-   Attribution analysis: compare Meta-reported conversions vs GA4 vs
    CRM to understand true impact

-   Cohort analysis: track how conversion rates change over time for
    users acquired in different periods

-   Spend efficiency analysis: which campaigns deliver the best ROAS
    relative to budget share

-   Anomaly detection: sudden drops in reach, conversion, or spend need
    immediate investigation

-   Incrementality thinking: is the campaign actually driving new
    revenue or capturing demand that would have converted anyway

8. Market Trends of Similar Products
====================================

The agent must be aware of what is happening in the market around the
product category so it can adapt strategy proactively.

-   Monitor search trend data on Google Trends for the product category
    and related keywords

-   Track seasonal demand patterns --- when does interest in the
    category peak and dip

-   Identify emerging consumer interests or behaviours relevant to the
    product

-   Monitor industry news sources and report summaries relevant to the
    product space

-   Track changes in Meta CPM and CPC benchmarks for the category ---
    rising costs may need strategic response

-   Identify trending content formats on Facebook and Instagram (e.g.
    Reels currently outperform static for reach)

-   Monitor any regulatory or platform policy changes that could affect
    ad delivery in the category

*Note: The agent should flag market trend insights in its weekly report
and recommend strategy adjustments where relevant.*

9. Competitor Analysis
======================

Understanding what competitors are doing helps the agent position ads
more effectively and identify gaps in the market.

What to Analyse
---------------

-   Competitor ad creatives --- messaging angles, visual style, offers
    being promoted

-   Competitor landing pages --- what happens after the click, what CTA
    they use

-   Pricing and offer comparison --- are competitors running discounts,
    bundles, or trials

-   Audience targeting signals --- what interests and demographics they
    appear to target

-   Ad frequency and spend estimation --- how aggressively they are
    advertising

Tools for Competitor Analysis
-----------------------------

-   Meta Ad Library (free) --- see all active ads any business is
    running on Facebook and Instagram

-   Semrush or Ahrefs --- competitor paid search and content strategy

-   SimilarWeb --- estimate competitor traffic and sources

-   Manual audit --- screenshot and categorise competitor ads weekly

How the Agent Uses This
-----------------------

-   Identify creative angles competitors are NOT using --- opportunity
    for differentiation

-   If a competitor is running the same angle heavily, test a contrarian
    message

-   Benchmark our CPA and ROAS against estimated industry standards for
    the category

10. Required Changes on Time in Ad Sets and Creatives
=====================================================

The agent must know when to act and what to change. Slow response to
underperformance wastes budget. Premature changes disrupt the algorithm.

When to Change Ad Creatives
---------------------------

-   CTR drops by more than 25 to 30 percent week-over-week --- creative
    fatigue signal

-   Frequency exceeds 3 to 4 for a cold audience --- same people seeing
    it too many times

-   Cost per result increases by more than 20 percent without
    explanation

-   Video ads with watch rate below 15 percent in the first 3 seconds
    --- hook is not working

When to Change Ad Set Targeting
-------------------------------

-   Audience size too small (under 500,000) and delivery is inconsistent

-   An audience segment (e.g. age 35-44) has CPA 2x higher than others
    --- exclude it

-   A lookalike audience is exhausted --- low reach with high frequency

-   Retargeting pool is too small --- widen the source audience or
    lookback window

When to Change Budgets
----------------------

-   ROAS is consistently above target for 5+ days --- safe to scale
    budget by 15 to 20 percent

-   CPA is above target for 7 days despite creative and audience
    optimisations --- reduce budget or pause

-   Ad set still in learning phase --- do NOT change budget until 50
    conversions are reached

What the Agent Should Never Change Without Human Approval
---------------------------------------------------------

-   Total monthly budget cap

-   Campaign objective (changing this resets the learning phase
    completely)

-   Adding entirely new audiences outside the agreed strategy

-   Any change during a sale, launch, or high-stakes promotional period

11. Additional Requirements (Recommended)
=========================================

These are requirements not listed in the original brief but which are
essential for the agent to function properly and safely.

Landing Page & Funnel Awareness
-------------------------------

-   The agent must have visibility into landing page performance ---
    conversion rate, bounce rate, time on page

-   If landing page conversion rate drops, the agent should flag it even
    if the ad is performing well --- bad page wastes good ad spend

-   The agent needs to know the full customer journey from ad click to
    final conversion

Audience & CRM Data Access
--------------------------

-   Access to CRM or lead database to create Custom Audiences from real
    customer lists

-   Lead quality feedback loop --- not just volume of leads but quality
    scored by the sales team

-   Customer lifetime value data to set realistic ROAS and CPA targets
    per product

Budget Governance & Guardrails
------------------------------

-   Hard spend caps per day, per week, per month that the agent cannot
    override

-   Human approval required for any single budget change above a defined
    threshold

-   Alert system: notify the human manager if ROAS drops below minimum
    or spend exceeds pacing

Platform & Policy Compliance
----------------------------

-   Ad copy must comply with Meta Advertising Policies --- agent needs
    to check before publishing

-   Restricted categories awareness: finance, health, housing ads have
    additional targeting restrictions

-   Avoid sensitive topics in creative or copy that could trigger ad
    rejection

Feedback & Learning Loop
------------------------

-   The agent should log every decision it makes and the outcome --- did
    the change improve performance

-   Weekly self-review: compare predicted vs actual outcomes for the
    actions it took

-   Human feedback mechanism: manager can approve or reject
    recommendations and the agent learns from this over time

Reporting & Communication
-------------------------

-   Automated weekly performance summary delivered to the team (email or
    Slack)

-   Clear explanation of what changed, why, and what the result was ---
    not just numbers

-   Highlight wins, highlight problems, and recommend next actions in
    plain language

*.*

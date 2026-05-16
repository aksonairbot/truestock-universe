---
name: Skynet AI feature inventory
description: All AI-powered features in SeekPeek as of 2026-05-13 — triage, clarity check, knowledge digest, daily review, briefings, dashboards
type: reference
originSessionId: 578800ae-3af6-4391-b443-4c882ff6a97b
---
**AI features shipped (all use `llm.complete()` with auto-fallback):**

1. **Task triage** (`apps/web/app/tasks/triage-action.ts`) — "Suggest" button on /tasks/new. Sends title + description + project catalogue + team roster + recent 30d activity counts to LLM. Returns suggested project, assignee, priority, due offset. Validates against real data. Includes knowledge digest context.

2. **Task clarity check** (`apps/web/app/tasks/clarity-action.ts`) — Intercepts form submit on /tasks/new. If task is vague, shows 1–3 follow-up questions. User can answer (Q&A appended to description) or skip. On LLM failure, task creation proceeds normally. Includes knowledge digest context.

3. **Knowledge digest** (`apps/web/lib/knowledge-digest.ts`) — Nightly cron generates structured snapshot: project stats (open/done/created counts), team patterns (velocity, busiest project, most active user), recent completions, active themes. LLM synthesizes prose summary. Stored in `ai_knowledge_digests` table. Injected into all AI prompts via `getDigestContext()`.

4. **Daily review** (`apps/web/lib/daily-review.ts`) — Nightly cron generates per-person + team summary with random tone (motivating/sarcastic/roasting/hype/chill/poetic/drill-sergeant/bollywood). Stored in `daily_reviews` table. Displayed as hero card on Today page (`/`).

5. **Morning briefing + EoD reflection** — Cards on Today page with personal stats and priorities.

6. **Project health summary** — AI narrative on `/projects/[slug]` pulse feed.

7. **Weekly + monthly bento dashboards** — Pattern-aware AI narrative in dashboard cells.

8. **Subtask AI** — "Break it down" on task slide-over generates subtask suggestions.

**Cron endpoints (protected by CRON_SECRET):**
- `GET /api/cron/daily-review` — runs daily review + piggybacks knowledge digest
- `GET /api/cron/knowledge-digest` — standalone digest generation

**DB tables:**
- `daily_reviews` (migration 0005) — userId, date, tone, body, stats
- `ai_knowledge_digests` (migration 0007) — date, scope, digest (jsonb), summary, provider/model/durationMs

**How to apply:** When adding new AI features, use `llm.complete()` for automatic provider fallback, and call `getDigestContext()` to inject team context. The digest is the model's institutional memory — it improves as more tasks are created/completed.

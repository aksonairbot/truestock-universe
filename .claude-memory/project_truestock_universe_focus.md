---
name: SeekPeek near-term focus (May 2026)
description: SeekPeek is daily task tracker + AI layer; sidebar has Today/My Week/Month/Tasks/Projects/Members/Team/Chat/Inbox; landing page shipped
type: project
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
**As of 2026-05-15, SeekPeek's focus is task management + AI intelligence layer + SaaS launch.**

**The headline KPI: "what did each person do during the day?"** The daily per-person rollup on `/` is the value proposition.

**Live UI surfaces on seekpeak.in:**
- `/` — Today page: cosmic banner, floating stat cards (due today, in progress, completed, focus score), AI daily review, per-person rollup
- `/me/week` — Personal weekly dashboard (bento grid)
- `/me/month` — Personal monthly dashboard
- `/tasks` — Asana-style list + Board view, click-to-complete, slide-over detail panel
- `/tasks/new` — AI triage (Suggest button), AI clarity check on submit
- `/projects` — project list with icons/banners
- `/projects/[slug]` — project detail with banner, icon upload (admin), pulse feed, quick-add task
- `/members` — workload table + per-person profiles (admin/manager only)
- `/team/week` — Team weekly dashboard for managers (per-member cards with done/active/overdue/open)
- `/team/month` — Team monthly dashboard for managers
- `/month` — Org-wide monthly rollup (admin/manager only)
- `/welcome` — Marketing landing page with hero, mockup, features, CTA (Google OAuth login)
- `/chat` — Team chat
- `/inbox` — Notifications inbox

**Sidebar nav (8 items):** Today, My Week, Month, Tasks, Projects, Members (privileged), Team (privileged), Chat, Inbox

**AI features (all use auto-fallback Ollama → DeepSeek → Anthropic):**
- Task triage, clarity check, knowledge digest, daily review, briefings, dashboard narratives

**Recent additions (2026-05-14 through 2026-05-17):**
- Team weekly + monthly dashboards for managers
- Full marketing landing page at /welcome with motion elements
- Favicon + PWA manifest
- Project chip color fixes (CSS attribute selectors)
- Today banner cropped
- Typography overhaul across all web screens (Poppins system, refined scale)
- **Light mode** fully built and deployed — theme toggle in sidebar
- **Flutter mobile app UI complete** — 19 files, 5 screens (Home/Tasks/QuickCapture/Chat/Profile), dark+light themes, at ~/Documents/Claude/Projects/Superman/seekpeek_mobile/
- Mobile design spec document (SeekPeek-Mobile-Design-Spec.docx)
- Setup script for Flutter SDK installation on Mac Mini

**Locked rules:**
1. Assigned tasks cannot be deleted — cancel only
2. Anyone can create/assign tasks
3. Every task must have assignee (defaults to creator) and due date
4. Daily summary is per-person, Asia/Kolkata timezone
5. Raw SQL against enum columns must cast with ::task_status

**Deployment:** SCP files to server → pnpm build → systemctl restart (git push broken, no GitHub SSH key)

## User
- [SeekPeek UI design preferences](feedback_skynet_design.md) — Dark-first + light mode built; cosmic aurora theme; Asana interaction patterns
- [Task creation UX rules](feedback_task_creation_rules.md) — Assignee defaults to creator and required; due date mandatory; clarity check before submit
- [Deploy via SCP](feedback_deploy_scp.md) — No git push; SCP to server then build; GitHub SSH key not set up
- [Deploy path correction](feedback_deploy_paths.md) — Server is /opt/truestock-universe, service is truestock-universe-web
- [PG enum cast requirement](feedback_pg_enum_casts.md) — Raw SQL must cast text to ::task_status for enum columns

## Project Status
- [SeekPeek near-term focus (May 2026)](project_truestock_universe_focus.md) — Task mgmt + AI + light mode + mobile app; sidebar: Today/Week/Month/Tasks/Projects/Members/Team/Chat/Inbox
- [SeekPeek SaaS status (May 2026)](seekpeek_saas_complete_status.md) — Phases 1-6 ~80% done; mobile UI complete; payments + email code ready; needs API keys
- [SeekPeek product + SaaS plan](project_seekpeek_saas.md) — 5-stage SaaS roadmap; Stage 4 (Flutter mobile) UI complete; wedge decision pending
- [SeekPeek Mobile Flutter project](project_seekpeek_mobile.md) — 19-file Flutter app; all screens built; setup script ready; needs Flutter SDK on Mac Mini
- [Truestock Universe project](project_truestock_universe.md) — SeekPeek on DO 206.189.141.160; MIS + Tasks + Projects; Next.js+Caddy+systemd
- [SeekPeek landing page](project_seekpeek_landing_page.md) — /welcome marketing page; .lp-* CSS; hero+mockup+features+CTA
- [Performance marketing agent spec](perf_marketing_agent_spec.md) — 11-section Meta Ads agent requirements; change thresholds and guardrails

## Reference (where to find things)
- [SeekPeek deployment procedures](reference_skynet_deployment.md) — SCP to server → pnpm build → systemctl; Caddy auto-TLS
- [SeekPeek deployment playbook](seekpeek_deployment_playbook.md) — SCP deploy commands, migrations 0001-0008, cron setup, DNS status
- [Deployment fixes and lessons](task_skynet_deployment.md) — Banner aspect ratio, settings page, month view, git safeguards
- [Deployment root-cause lessons](deployment_lessons.md) — Missing env, git locks, missing deps, permission issues; prevention checklist
- [SeekPeek LLM routing](reference_skynet_llm.md) — Auto-fallback Ollama→DeepSeek→Anthropic; knowledge digest injection
- [SeekPeek AI feature inventory](reference_skynet_ai_features.md) — Triage, clarity check, knowledge digest, daily review, briefings, dashboards
- [DB exports reference](reference_seekpeek_db_exports.md) — @tu/db exports: sql,eq,and,or,gte,lte,inArray etc; 'not' NOT exported

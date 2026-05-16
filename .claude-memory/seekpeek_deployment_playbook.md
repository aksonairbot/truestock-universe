---
name: SeekPeek deployment playbook
description: Deploy via SCP + pnpm build; applied migrations list; cron + DNS status
type: reference
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
## Current Deployment (as of 2026-05-15)

**Server:** DO droplet `206.189.141.160`, domain `seekpeak.in` / `www.seekpeak.in`
**App:** `/opt/truestock-universe`, env at `.env` (repo root)
**Process:** systemd `truestock-universe-web`
**Proxy:** Caddy with auto-TLS

### Deploy via SCP (git push broken)
```bash
# From Mac terminal
cd ~/Documents/Claude/Projects/Superman/truestock-universe
scp <changed-file> root@206.189.141.160:/opt/truestock-universe/<changed-file>
ssh root@206.189.141.160 "cd /opt/truestock-universe && pnpm build && systemctl restart truestock-universe-web"
```

For new directories, create them first:
```bash
ssh root@206.189.141.160 "mkdir -p /opt/truestock-universe/apps/web/app/<new-dir>"
```

### With SQL Migrations
```bash
ssh root@206.189.141.160 "cd /opt/truestock-universe && \
  export \$(grep DATABASE_URL .env) && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/XXXX.sql && \
  pnpm build && systemctl restart truestock-universe-web"
```

### Applied Migrations
- 0001 through 0005: base schema + daily_reviews
- 0006: project icon_url column
- 0007: ai_knowledge_digests table
- 0008: user_badges table

## Git Status
- Remote: `git@github.com:aksonairbot/truestock-universe.git` (SSH)
- Push broken: no SSH key for GitHub on Mac, password forgotten
- TODO: Set up SSH key to restore git push

## Cron (set up on server)
```bash
# 9 AM IST = 3:30 UTC — daily review + knowledge digest
30 3 * * * curl -s -H "x-cron-secret: <secret>" http://localhost:3000/api/cron/daily-review
```

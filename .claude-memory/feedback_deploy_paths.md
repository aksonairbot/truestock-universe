---
name: Always use correct server deploy paths
description: Server app path is /opt/truestock-universe, service is truestock-universe-web — never use /var/www/ or seekpeak/seekpeek as path
type: feedback
originSessionId: 578800ae-3af6-4391-b443-4c882ff6a97b
---
Always read deployment memory before giving deploy commands. The correct values are:

- **Server path:** `/opt/truestock-universe` (NOT `/var/www/seekpeak`, NOT `/var/www/seekpeek`)
- **Service name:** `truestock-universe-web` (NOT `seekpeak`, NOT `seekpeek`)
- **Migration method:** `psql "$DATABASE_URL" -f ...` (NOT `pnpm db:push` which needs interactive TTY)

**Why:** Gave wrong deploy path twice (`/var/www/seekpeek`, `/var/www/seekpeak`) causing failed deploys and wasted user time.

**How to apply:** Before generating any SSH deploy command, read `reference_skynet_deployment.md` or `seekpeek_deployment_playbook.md` to get exact paths. Never guess from memory.

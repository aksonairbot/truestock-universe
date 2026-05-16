---
name: SeekPeek deployment procedures
description: How to deploy SeekPeek — SCP files to server + pnpm build + systemctl; git push broken (no GitHub SSH key)
type: reference
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
**Server:** DO droplet `206.189.141.160` (BLR1, ubuntu). Domain: `seekpeak.in` + `www.seekpeak.in`.

**App path:** `/opt/truestock-universe` (NOT `/root/truestock-universe`)

**Env file:** `/opt/truestock-universe/.env` (at repo root, NOT in `apps/web/`)

**Process manager:** systemd service `truestock-universe-web` (NOT pm2, NOT tmux)
- Restart: `systemctl restart truestock-universe-web`
- Logs: `journalctl -u truestock-universe-web -f`

**Reverse proxy:** Caddy with auto-TLS (Let's Encrypt). Serves both `seekpeak.in` and `www.seekpeak.in`.

**Git remote:** `git@github.com:aksonairbot/truestock-universe.git` (SSH format, was HTTPS). BUT no SSH key is set up on Mac for GitHub — `git push` fails with "Permission denied (publickey)". Amit doesn't remember his GitHub password either.

**Current deploy method (SCP — as of 2026-05-15):**
```bash
# From Mac terminal — SCP changed files directly to server
cd ~/Documents/Claude/Projects/Superman/truestock-universe
scp <file> root@206.189.141.160:/opt/truestock-universe/<file>

# Then rebuild on server
ssh root@206.189.141.160 "cd /opt/truestock-universe && pnpm build && systemctl restart truestock-universe-web"
```

**With migrations:**
```bash
ssh root@206.189.141.160 "cd /opt/truestock-universe && \
  export \$(grep DATABASE_URL .env) && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/XXXX_migration.sql && \
  pnpm build && systemctl restart truestock-universe-web"
```

**Migration pattern:** Write plain SQL files at `packages/db/drizzle/0NNN_name.sql`, use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for idempotency. Apply via `psql`. Do NOT use `drizzle:push`.

**Build command:** `pnpm build` (runs turborepo, builds web + db packages)

**Git sandbox limitation:** Git operations from Claude's bash sandbox can't push to GitHub (no credentials). All git push must come from Mac terminal — but that's also broken right now. Use SCP instead.

**TODO:** Set up GitHub SSH key on Mac to restore normal git push workflow.

---
name: Deploy via SCP (no git push available)
description: GitHub push broken — deploy changed files via SCP directly to server, then build
type: feedback
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
Git push to GitHub is not working from either the sandbox or the Mac (HTTPS needs password Amit doesn't remember, SSH keys not set up for GitHub). The git remote was switched to SSH (`git@github.com:aksonairbot/truestock-universe.git`) but no SSH key is configured.

**Why:** No GitHub credentials available. User doesn't remember password and no SSH key exists for GitHub on the Mac.

**How to apply:**
1. Make changes and commit locally on Mac
2. SCP changed files directly to server: `scp <file> root@206.189.141.160:/opt/truestock-universe/<file>`
3. SSH to server and rebuild: `ssh root@206.189.141.160 "cd /opt/truestock-universe && pnpm build && systemctl restart truestock-universe-web"`
4. The Mac has SSH key access to the DO server (root@206.189.141.160) — that works fine
5. Future: should set up GitHub SSH key on Mac to restore normal git push workflow

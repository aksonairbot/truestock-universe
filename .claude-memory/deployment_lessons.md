---
name: Deployment Lessons Learned
description: Root causes of May 2026 deployment issues and preventative measures
type: feedback
originSessionId: e276106c-fc42-4e76-8c5a-1907bc2b7c6b
---
## Issues Encountered

1. **Missing /etc/truestock/env**
   - **Why:** Deployment script expected production env file in specific location
   - **How to apply:** Create env file setup as first-time deployment step, document in DEPLOYMENT.md

2. **Git repository locked on feature branch**
   - **Why:** Previous work on feat/stage1-multi-tenancy left staged changes and lock files
   - **How to apply:** Always reset to main before deploy; add `git reset --hard origin/main` to deploy script

3. **Missing dependencies (lucide-react)**
   - **Why:** Package added locally but pnpm-lock.yaml wasn't committed to git
   - **How to apply:** ALWAYS commit pnpm-lock.yaml; use --frozen-lockfile in CI/deploy

4. **Missing stub files for incomplete features**
   - **Why:** Code referenced lib files (auth-multi-org, payment-gateway-router, etc.) that existed locally but weren't committed
   - **How to apply:** Create ALL stub files in git, even if feature is incomplete; don't rely on manual creation

5. **Permission issues (root vs truestock user)**
   - **Why:** Git and pnpm operations run as truestock user but files were owned by root
   - **How to apply:** Set chown -R truestock:truestock immediately after cloning/pulling

## Prevention Checklist

Before any push to main:
- [ ] `pnpm install --frozen-lockfile` passed locally
- [ ] `pnpm build --filter=web` completed successfully
- [ ] `pnpm-lock.yaml` is committed
- [ ] All lib stub files exist and are committed
- [ ] `.env` is NOT staged (should only be in .gitignore)
- [ ] `pnpm typecheck` passes (or explicitly ignored in next.config.js)

Before deployment:
- [ ] `/etc/truestock/env` exists with correct DATABASE_URL
- [ ] `chown -R truestock:truestock /opt/truestock-universe` run
- [ ] Previous git locks removed: `find .git -name "*.lock" -delete`
- [ ] Database connection verified: `psql $DATABASE_URL -c "SELECT 1"`

## Key Files to Document

- DEPLOYMENT.md - step-by-step deployment guide
- deploy/pre-check.sh - automated validation before deploy
- .env.production.example - template for required variables
- .gitignore - includes .env, lock files
- .git/hooks/pre-commit - prevents .env commits

#!/usr/bin/env bash
# ============================================================
# SeekPeak — deploy WITHOUT touching git
# ============================================================
# Why this exists (2026-07-30):
#   deploy.sh starts by auto-committing, and on a Mac where this repo lives in
#   iCloud Drive that failed hard:
#       fatal: sha1 file '.git/index.lock' write error: Operation timed out
#   iCloud can serve reads but stall on writes into .git. The git steps in
#   deploy.sh only exist for auto-commit + version tagging — they are NOT
#   required to ship code. This script does the parts that actually deploy:
#   rsync → migrations → build → restart, with the same failed-build
#   protection as deploy.sh.
#
# Trade-off, stated plainly: NO commit and NO version tag is created. Commit
# from a machine where git works (or once iCloud settles) so history isn't
# lost. `bash deploy.sh --rollback vX.Y` still works off existing tags.
#
# Usage:  bash deploy-nogit.sh
# ============================================================

set -euo pipefail

SERVER="root@206.189.141.160"
REMOTE="/opt/truestock-universe"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PARENT="$(cd .. && pwd -P)"

# Prefer the dedicated deploy key that lives beside the repo, so this works
# from any of Amit's Macs without configuring ~/.ssh first.
KEY="$PARENT/.cowork-ssh/id_ed25519"
KNOWN="$PARENT/.cowork-ssh/known_hosts"
if [ -f "$KEY" ]; then
    chmod 600 "$KEY" 2>/dev/null || true
    SSH_CMD="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$KNOWN -o ConnectTimeout=15"
    echo "  using deploy key: .cowork-ssh/id_ed25519"
else
    SSH_CMD="ssh -o ConnectTimeout=15"
    echo "  using your default SSH key"
fi

echo ""
echo "======================================"
echo "  SeekPeak — Deploy (no git)"
echo "======================================"
echo ""

# ── Preflight: fail fast and clearly if we can't reach the droplet ──
echo "[0/5] Checking connection to the server..."
if ! $SSH_CMD "$SERVER" "echo ok" >/dev/null 2>&1; then
    echo ""
    echo "  ✗ Cannot reach $SERVER"
    echo ""
    echo "  Nothing was changed. Fix SSH access first, e.g.:"
    echo "    ssh-copy-id -i $PARENT/.cowork-ssh/id_ed25519.pub $SERVER"
    echo "  or deploy from the Mac Mini, which already has access."
    exit 1
fi
echo "  ✓ connected"

# ── Upload ──
# Same allowlist as deploy.sh. IMPORTANT: this list is explicit — a NEW
# top-level directory under apps/web needs its own rsync line here, or the
# server build fails with "Can't resolve …".
echo "[1/5] Uploading (rsync, excluding node_modules)..."
RSYNC_FLAGS="-az --delete --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=tsconfig.tsbuildinfo --exclude=.git"
rsync $RSYNC_FLAGS -e "$SSH_CMD" apps/web/app/    "$SERVER:$REMOTE/apps/web/app/"
rsync $RSYNC_FLAGS -e "$SSH_CMD" apps/web/public/ "$SERVER:$REMOTE/apps/web/public/"
rsync -az --exclude=node_modules -e "$SSH_CMD" apps/web/lib/        "$SERVER:$REMOTE/apps/web/lib/"
rsync -az --exclude=node_modules -e "$SSH_CMD" apps/web/components/ "$SERVER:$REMOTE/apps/web/components/"
rsync -az -e "$SSH_CMD" apps/web/auth.ts apps/web/middleware.ts apps/web/next.config.mjs \
    apps/web/package.json apps/web/server.js apps/web/tailwind.config.ts \
    apps/web/postcss.config.mjs apps/web/tsconfig.json \
    "$SERVER:$REMOTE/apps/web/"
rsync $RSYNC_FLAGS -e "$SSH_CMD" packages/ "$SERVER:$REMOTE/packages/"
rsync -az -e "$SSH_CMD" package.json pnpm-workspace.yaml turbo.json tsconfig.base.json "$SERVER:$REMOTE/"
echo "  ✓ uploaded"

# ── Migrations ──
# Every migration file is replayed each deploy; they're written to be
# idempotent, so this is safe. The 0000_* file logs errors about dropped
# product_* columns — pre-existing noise, not a failure.
echo "[2/5] Running migrations..."
$SSH_CMD "$SERVER" "cd $REMOTE && export \$(grep DATABASE_URL .env) && \
  for f in packages/db/drizzle/*.sql; do \
    psql \"\$DATABASE_URL\" -f \"\$f\" 2>&1 | grep -v 'already exists' || true; \
  done" | tail -20
echo "  ✓ migrations done"

# ── Build, with the working build snapshotted first ──
# `next build` overwrites .next BEFORE it typechecks, so a compile error used
# to leave the live site serving stale HTML against missing chunks (every
# /_next/static/* returned 400 — the site looked fine and no JS loaded).
echo "[3/5] Building (previous build snapshotted first)..."
$SSH_CMD "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev; if [ -d .next ]; then cp -a .next .next.prev; fi" || true

if ! $SSH_CMD "$SERVER" "cd $REMOTE && (pnpm install --frozen-lockfile 2>/dev/null || pnpm install) && pnpm build"; then
    echo ""
    echo "======================================"
    echo "  ✗ BUILD FAILED — restoring previous build"
    echo "======================================"
    $SSH_CMD "$SERVER" "cd $REMOTE/apps/web && if [ -d .next.prev ]; then rm -rf .next && mv .next.prev .next; fi" || true
    $SSH_CMD "$SERVER" "systemctl restart truestock-universe-web" || true
    sleep 3
    echo "  Site restored to the previous build. Nothing new shipped."
    echo "  Fix the error above and re-run this script."
    exit 1
fi
$SSH_CMD "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev" || true
echo "  ✓ build ok"

# ── Restart ──
echo "[4/5] Restarting service..."
$SSH_CMD "$SERVER" "systemctl restart truestock-universe-web"
sleep 3
STATUS=$($SSH_CMD "$SERVER" "systemctl is-active truestock-universe-web" || echo unknown)

echo "[5/5] Verifying the site serves its own assets..."
# The failure mode that looked like "login is not working" was the HTML loading
# while every JS chunk 400'd. Check one real asset, not just that a page 200s.
HTML=$(curl -fsS -m 20 https://seekpeak.in/welcome || true)
ASSET=$(printf '%s' "$HTML" | grep -o '/_next/static/chunks/app/layout-[^"]*\.js' | head -1)
if [ -n "$ASSET" ]; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://seekpeak.in$ASSET")
    if [ "$CODE" = "200" ]; then
        ASSET_OK="✓ assets serving (200)"
    else
        ASSET_OK="✗ ASSET $CODE — the build on disk does not match what's being served"
    fi
else
    ASSET_OK="? could not read the page to check assets"
fi

echo ""
echo "======================================"
if [ "$STATUS" = "active" ]; then
    echo "  ✓ Deployed (untagged)"
else
    echo "  ✗ Service is $STATUS"
    echo "  Logs: $SSH_CMD $SERVER journalctl -u truestock-universe-web -n 50"
fi
echo "  Service: $STATUS"
echo "  Assets:  $ASSET_OK"
echo "  Site:    https://seekpeak.in"
echo ""
echo "  No git commit or tag was made — commit from a machine where git works."
echo "======================================"

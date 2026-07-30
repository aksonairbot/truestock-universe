#!/bin/bash
# ============================================================
# SeekPeek — Safe Deploy with Auto-Tagging & Rollback
# ============================================================
# Every successful deploy gets a Git tag. If a deploy breaks,
# you can roll back instantly:
#
#   bash deploy.sh                    → deploy latest
#   bash deploy.sh --rollback v1.2    → roll back to v1.2
#   bash deploy.sh --tags             → list all deploy tags
#   bash deploy.sh --dry-run          → show what would deploy
# ============================================================

set -e
SERVER="root@206.189.141.160"
REMOTE="/opt/truestock-universe"
LOCAL="$HOME/Documents/Claude/Projects/Superman/truestock-universe"

cd "$LOCAL"

# ── List tags ──
if [ "$1" = "--tags" ]; then
    echo ""
    echo "Deploy history:"
    git tag -l 'v*' --sort=-v:refname | while read tag; do
        DATE=$(git log -1 --format='%ai' "$tag" 2>/dev/null | cut -d' ' -f1)
        MSG=$(git tag -l -n1 "$tag" | sed "s/^$tag//;s/^ *//")
        echo "  $tag  ($DATE)  $MSG"
    done
    echo ""
    exit 0
fi

# ── Rollback mode ──
if [ "$1" = "--rollback" ] && [ -n "$2" ]; then
    TAG="$2"
    echo ""
    echo "⚠️  ROLLING BACK to $TAG"
    echo ""

    # Verify tag exists
    if ! git rev-parse "$TAG" >/dev/null 2>&1; then
        echo "Error: tag $TAG not found. Run 'bash deploy.sh --tags' to see available tags."
        exit 1
    fi

    git checkout "$TAG"
    scp -r apps/web/src "$SERVER:$REMOTE/apps/web/" 2>/dev/null || true
    scp -r apps/web/app "$SERVER:$REMOTE/apps/web/"
    scp -r packages "$SERVER:$REMOTE/"
    scp apps/web/package.json "$SERVER:$REMOTE/apps/web/"
    ssh "$SERVER" "cd $REMOTE && pnpm install && pnpm build && systemctl restart truestock-universe-web"
    git checkout main

    echo ""
    echo "✓ Rolled back to $TAG. Service restarted."
    exit 0
fi

# ── Normal deploy ──
echo ""
echo "======================================"
echo "  SeekPeek — Deploy"
echo "======================================"

# Step 1: Calculate version
LAST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
    NEXT_VERSION="v1.0"
else
    MAJOR=$(echo "$LAST_TAG" | cut -d'v' -f2 | cut -d'.' -f1)
    MINOR=$(echo "$LAST_TAG" | cut -d'.' -f2)
    NEXT_VERSION="v${MAJOR}.$((MINOR + 1))"
fi

echo ""
echo "  Last version: ${LAST_TAG:-none}"
echo "  This deploy:  $NEXT_VERSION"
echo ""

# Dry run check
if [ "$1" = "--dry-run" ]; then
    echo "Files that would be deployed:"
    if [ -n "$LAST_TAG" ]; then
        git diff --stat "$LAST_TAG"..HEAD
    else
        echo "  (first tagged deploy — all files)"
    fi
    exit 0
fi

# Step 2: Commit any uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "[1/6] Committing local changes..."
    git add -A
    git commit -m "deploy: $NEXT_VERSION"
else
    echo "[1/6] ✓ Working tree clean"
fi

# Step 3: Upload to server via rsync.
#   - excludes node_modules + .next so we never re-upload deps (this was the
#     source of the 2026-05-22 stall — scp -r dragged packages/db/node_modules
#     across the wire and macOS scp timed out)
#   - --delete on apps/web/app and packages/ so files we deleted locally
#     (e.g. apps/web/app/mis, packages/razorpay/src/process-event.ts) also
#     disappear from the server. Without --delete, removed routes would
#     still serve from the old .next bundle.
echo "[2/6] Uploading to server (rsync, excluding node_modules)..."
RSYNC_FLAGS="-az --delete --exclude=node_modules --exclude=.next --exclude=.turbo --exclude=tsconfig.tsbuildinfo --exclude=.git"
rsync $RSYNC_FLAGS apps/web/app/        "$SERVER:$REMOTE/apps/web/app/"
rsync $RSYNC_FLAGS apps/web/public/     "$SERVER:$REMOTE/apps/web/public/"
rsync -az --exclude=node_modules apps/web/lib/        "$SERVER:$REMOTE/apps/web/lib/" 2>/dev/null || true
# components/ was added 2026-07-26 (shared UI like the markdown renderer) —
# it MUST ship, or the server build fails with "Can't resolve '@/components/…'"
rsync -az --exclude=node_modules apps/web/components/ "$SERVER:$REMOTE/apps/web/components/"
rsync -az apps/web/auth.ts apps/web/middleware.ts apps/web/next.config.mjs \
  apps/web/package.json apps/web/server.js apps/web/tailwind.config.ts \
  apps/web/postcss.config.mjs apps/web/tsconfig.json \
  "$SERVER:$REMOTE/apps/web/"
rsync $RSYNC_FLAGS packages/             "$SERVER:$REMOTE/packages/"
rsync -az package.json pnpm-workspace.yaml turbo.json tsconfig.base.json \
  "$SERVER:$REMOTE/"

# Step 4: Run any new migrations
echo "[3/6] Running migrations..."
ssh "$SERVER" "cd $REMOTE && export \$(grep DATABASE_URL .env) && \
  for f in packages/db/drizzle/*.sql; do \
    psql \"\$DATABASE_URL\" -f \"\$f\" 2>&1 | grep -v 'already exists' || true; \
  done"

# Step 5: Build on server.
#
# A failed build used to take the LIVE SITE DOWN (seen 2026-07-30, v1.25).
# Why: `next build` overwrites .next before it runs the typecheck, and `set -e`
# killed this script at this line — before the restart and before the rollback
# block below, which only ever triggered on a failed SERVICE start, never on a
# failed BUILD. The old process kept serving stale HTML pointing at chunk
# hashes that no longer existed on disk, so every /_next/static/* returned 400:
# pages rendered with zero JavaScript and nothing was clickable.
#
# So: snapshot the working .next first, and put it back if the new code doesn't
# compile. A failed deploy now leaves the site exactly as it was.
echo "[4/6] Building..."
ssh "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev; if [ -d .next ]; then cp -a .next .next.prev; fi" || true

if ! ssh "$SERVER" "cd $REMOTE && (pnpm install --frozen-lockfile 2>/dev/null || pnpm install) && pnpm build"; then
    echo ""
    echo "======================================"
    echo "  ✗ BUILD FAILED — restoring previous build"
    echo "======================================"
    ssh "$SERVER" "cd $REMOTE/apps/web && if [ -d .next.prev ]; then rm -rf .next && mv .next.prev .next; fi" || true
    ssh "$SERVER" "systemctl restart truestock-universe-web" || true
    sleep 3
    RESTORED=$(ssh "$SERVER" "systemctl is-active truestock-universe-web" || echo unknown)
    echo ""
    echo "  Site restored to the previous build. Service: $RESTORED"
    echo "  Nothing new was deployed — fix the error above and run deploy.sh again."
    echo ""
    echo "  Note: server source files and DB migrations ARE already updated."
    echo "  Migrations are written to be idempotent, so re-running is safe."
    echo "======================================"
    exit 1
fi

# New build is good — drop the snapshot so .next.prev can't grow stale or eat disk.
ssh "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev" || true

# Step 6: Restart and verify
echo "[5/6] Restarting service..."
ssh "$SERVER" "systemctl restart truestock-universe-web"

sleep 3
STATUS=$(ssh "$SERVER" "systemctl is-active truestock-universe-web")

if [ "$STATUS" = "active" ]; then
    # Tag this successful deploy
    git tag -a "$NEXT_VERSION" -m "Deploy $(date '+%Y-%m-%d %H:%M') — $STATUS"
    git push origin main --tags 2>/dev/null || echo "  ⚠ Git push failed — tag saved locally"

    echo ""
    echo "======================================"
    echo "  ✓ Deployed $NEXT_VERSION"
    echo "  Service: active"
    echo "  Site: https://seekpeak.in"
    echo ""
    echo "  Rollback: bash deploy.sh --rollback ${LAST_TAG:-v1.0}"
    echo "  History:  bash deploy.sh --tags"
    echo "======================================"
else
    echo ""
    echo "======================================"
    echo "  ✗ SERVICE FAILED TO START — service is $STATUS"
    echo "  (the build compiled; the process did not come up)"
    echo "======================================"

    if [ -n "$LAST_TAG" ]; then
        echo ""
        echo "  Auto-rolling back to $LAST_TAG..."
        git checkout "$LAST_TAG"
        scp -r apps/web/app "$SERVER:$REMOTE/apps/web/"
        scp -r packages "$SERVER:$REMOTE/"
        ssh "$SERVER" "cd $REMOTE && pnpm build && systemctl restart truestock-universe-web"
        git checkout main
        echo "  ✓ Rolled back to $LAST_TAG"
    else
        echo "  No previous version to roll back to."
        echo "  Check logs: ssh $SERVER journalctl -u truestock-universe-web -n 50"
    fi
fi

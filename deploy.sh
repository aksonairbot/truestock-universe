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

# Step 3: Upload to server
echo "[2/6] Uploading to server..."
scp -r apps/web/app "$SERVER:$REMOTE/apps/web/"
scp -r apps/web/src "$SERVER:$REMOTE/apps/web/" 2>/dev/null || true
scp -r apps/web/public "$SERVER:$REMOTE/apps/web/"
scp -r packages "$SERVER:$REMOTE/"
scp apps/web/package.json "$SERVER:$REMOTE/apps/web/"
scp apps/web/next.config.mjs "$SERVER:$REMOTE/apps/web/" 2>/dev/null || true
scp package.json pnpm-workspace.yaml "$SERVER:$REMOTE/" 2>/dev/null || true

# Step 4: Run any new migrations
echo "[3/6] Running migrations..."
ssh "$SERVER" "cd $REMOTE && export \$(grep DATABASE_URL .env) && \
  for f in packages/db/drizzle/*.sql; do \
    psql \"\$DATABASE_URL\" -f \"\$f\" 2>&1 | grep -v 'already exists' || true; \
  done"

# Step 5: Build on server
echo "[4/6] Building..."
ssh "$SERVER" "cd $REMOTE && pnpm install --frozen-lockfile 2>/dev/null || pnpm install && pnpm build"

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
    echo "  ✗ BUILD FAILED — service is $STATUS"
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

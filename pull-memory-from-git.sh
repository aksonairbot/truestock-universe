#!/bin/bash
# Pull memory from Git and sync to Claude's local memory
# Run this on any Mac to sync Claude memory from the shared Git repo
# Usage: bash ~/Documents/Claude/Projects/Superman/truestock-universe/pull-memory-from-git.sh

set -e
REPO_DIR=~/Documents/Claude/Projects/Superman/truestock-universe
GIT_MEMORY="$REPO_DIR/.claude-memory"

echo ""
echo "======================================"
echo "  Claude Memory — Pull & Sync"
echo "======================================"

# Step 1: Git pull latest
echo ""
echo "[1/3] Pulling latest from Git..."
cd "$REPO_DIR"
git pull origin main --quiet
echo "  ✓ Repo updated"

# Step 2: Find Claude's local memory directory
echo ""
echo "[2/3] Finding Claude memory directory..."
SESSIONS_DIR="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
MEMORY_DIR=$(find "$SESSIONS_DIR" -path "*/memory/MEMORY.md" -print -quit 2>/dev/null | xargs dirname 2>/dev/null || true)

if [ -z "$MEMORY_DIR" ] || [ ! -d "$MEMORY_DIR" ]; then
    echo "  ⚠ No Claude memory directory found."
    echo "  Open Claude Cowork first with a project folder, then re-run this script."
    exit 1
fi

echo "  ✓ Found: $MEMORY_DIR"

# Step 3: Sync files from Git to Claude memory
echo ""
echo "[3/3] Syncing memory files..."
SYNCED=0
SKIPPED=0

for file in "$GIT_MEMORY"/*.md; do
    filename=$(basename "$file")
    dest="$MEMORY_DIR/$filename"

    # Compare and only copy if different
    if [ -f "$dest" ]; then
        if diff -q "$file" "$dest" > /dev/null 2>&1; then
            SKIPPED=$((SKIPPED + 1))
            continue
        fi
    fi

    cp "$file" "$dest"
    SYNCED=$((SYNCED + 1))
    echo "  ↳ Updated: $filename"
done

echo ""
echo "======================================"
echo "  ✓ Sync complete!"
echo "  Updated: $SYNCED files"
echo "  Unchanged: $SKIPPED files"
echo "======================================"
echo ""

#!/bin/bash
# Push everything to Git — run from your Mac Mini terminal
# Usage: bash ~/Documents/Claude/Projects/Superman/truestock-universe/git-push-all.sh

set -e
REPO_DIR=~/Documents/Claude/Projects/Superman/truestock-universe
MEMORY_SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"

cd "$REPO_DIR"

echo ""
echo "======================================"
echo "  SeekPeek — Git Push All"
echo "======================================"

# Step 1: Sync latest memory files
echo ""
echo "[1/4] Syncing memory files..."
MEMORY_DIR=$(find "$MEMORY_SRC" -path "*/memory/MEMORY.md" -print -quit 2>/dev/null | xargs dirname 2>/dev/null || true)
if [ -n "$MEMORY_DIR" ] && [ -d "$MEMORY_DIR" ]; then
    mkdir -p "$REPO_DIR/.claude-memory"
    cp "$MEMORY_DIR"/*.md "$REPO_DIR/.claude-memory/"
    echo "  ✓ Memory files synced from Claude"
else
    echo "  ⚠ No Claude memory directory found — using existing .claude-memory/"
fi

# Step 2: Add GitHub known hosts (fixes SSH)
echo ""
echo "[2/4] Ensuring GitHub SSH is configured..."
mkdir -p ~/.ssh
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
echo "  ✓ GitHub host key added"

# Step 3: Stage everything
echo ""
echo "[3/4] Staging files..."
git add -A
echo "  Files staged:"
git diff --cached --stat | tail -5

# Step 4: Commit and push
echo ""
echo "[4/4] Committing and pushing..."
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git commit -m "feat: mobile app UI + memory backup ($TIMESTAMP)

- SeekPeek Flutter mobile app (19 Dart files, 5 screens)
- Claude memory files (.claude-memory/)
- Setup scripts and design spec
- Light mode + typography updates" || echo "  Nothing to commit"

git push origin main

echo ""
echo "======================================"
echo "  ✓ Pushed to GitHub!"
echo "======================================"
echo ""

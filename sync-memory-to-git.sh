#!/bin/bash
# Daily memory backup — copies Claude memory files to git repo and pushes
# Designed to be run by a scheduled task or cron
# Usage: bash ~/Documents/Claude/Projects/Superman/truestock-universe/sync-memory-to-git.sh

set -e
REPO_DIR=~/Documents/Claude/Projects/Superman/truestock-universe
MEMORY_SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
LOG_FILE="$REPO_DIR/.claude-memory/sync.log"

cd "$REPO_DIR"

# Find the latest Claude memory directory
MEMORY_DIR=$(find "$MEMORY_SRC" -path "*/memory/MEMORY.md" -print -quit 2>/dev/null | xargs dirname 2>/dev/null || true)

if [ -z "$MEMORY_DIR" ] || [ ! -d "$MEMORY_DIR" ]; then
    echo "$(date): No Claude memory directory found. Skipping." >> "$LOG_FILE"
    exit 0
fi

# Sync memory files
mkdir -p "$REPO_DIR/.claude-memory"
cp "$MEMORY_DIR"/*.md "$REPO_DIR/.claude-memory/"

# Check if anything changed
cd "$REPO_DIR"
if git diff --quiet .claude-memory/ 2>/dev/null && git diff --cached --quiet .claude-memory/ 2>/dev/null; then
    # Check for new untracked files too
    UNTRACKED=$(git ls-files --others --exclude-standard .claude-memory/ | wc -l)
    if [ "$UNTRACKED" -eq 0 ]; then
        echo "$(date): No memory changes. Skipping push." >> "$LOG_FILE"
        exit 0
    fi
fi

# Stage, commit, push
git add .claude-memory/
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git commit -m "chore: daily memory backup ($TIMESTAMP)" || exit 0
git push origin main

echo "$(date): Memory backup pushed to Git." >> "$LOG_FILE"

#!/bin/bash
# ============================================================
# Claude Memory — Safe Bidirectional Sync via Git
# ============================================================
# Works on any Mac. Syncs in BOTH directions:
#   Local memory → Git (push your changes)
#   Git → Local memory (pull others' changes)
#
# Safety: uses Git as merge layer — newer wins, nothing gets wiped.
# Usage: bash ~/Documents/Claude/Projects/Superman/truestock-universe/sync-memory.sh
# ============================================================

REPO_DIR=~/Documents/Claude/Projects/Superman/truestock-universe
GIT_MEMORY="$REPO_DIR/.claude-memory"
MEMORY_SRC="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
LOG_FILE="$GIT_MEMORY/sync.log"
MACHINE=$(hostname -s)

mkdir -p "$GIT_MEMORY"
cd "$REPO_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') [$MACHINE] $1" >> "$LOG_FILE"; echo "$1"; }

# ── Step 1: Find Claude's local memory directory ──
MEMORY_DIR=$(find "$MEMORY_SRC" -path "*/memory/MEMORY.md" -print -quit 2>/dev/null | xargs dirname 2>/dev/null || true)

if [ -z "$MEMORY_DIR" ] || [ ! -d "$MEMORY_DIR" ]; then
    log "⚠ No local Claude memory found. Pull-only mode."
    PULL_ONLY=true
else
    PULL_ONLY=false
    log "Local memory: $MEMORY_DIR"
fi

# ── Step 2: Pull latest from Git (get other machine's changes) ──
log "Pulling from Git..."
git pull --rebase origin main 2>/dev/null || {
    log "⚠ Git pull failed — continuing with local sync only"
}

# ── Step 3: Merge Git → Local memory (only newer files from Git) ──
PULLED=0
if [ "$PULL_ONLY" = false ]; then
    for git_file in "$GIT_MEMORY"/*.md; do
        [ -f "$git_file" ] || continue
        filename=$(basename "$git_file")
        [ "$filename" = "sync.log" ] && continue
        local_file="$MEMORY_DIR/$filename"

        if [ ! -f "$local_file" ]; then
            # New file from other machine — add it locally
            cp "$git_file" "$local_file"
            PULLED=$((PULLED + 1))
        elif ! diff -q "$git_file" "$local_file" > /dev/null 2>&1; then
            # Files differ — keep whichever is newer
            if [ "$git_file" -nt "$local_file" ]; then
                cp "$git_file" "$local_file"
                PULLED=$((PULLED + 1))
            fi
            # If local is newer, we'll push it in Step 4
        fi
    done
    [ $PULLED -gt 0 ] && log "↓ Pulled $PULLED file(s) from Git → local memory"
fi

# ── Step 4: Merge Local memory → Git (only newer local files) ──
PUSHED=0
if [ "$PULL_ONLY" = false ]; then
    for local_file in "$MEMORY_DIR"/*.md; do
        [ -f "$local_file" ] || continue
        filename=$(basename "$local_file")
        git_file="$GIT_MEMORY/$filename"

        if [ ! -f "$git_file" ]; then
            # New file from this machine — add to Git
            cp "$local_file" "$git_file"
            PUSHED=$((PUSHED + 1))
        elif ! diff -q "$local_file" "$git_file" > /dev/null 2>&1; then
            # Files differ — only overwrite Git if local is newer
            if [ "$local_file" -nt "$git_file" ]; then
                cp "$local_file" "$git_file"
                PUSHED=$((PUSHED + 1))
            fi
        fi
    done
fi

# ── Step 5: Handle deleted files ──
# If a file exists in Git but not locally, and local memory dir exists,
# DON'T delete from Git — the other machine may still need it.
# Deletion must be manual/intentional.

# ── Step 6: Commit and push if anything changed ──
if [ $PUSHED -gt 0 ]; then
    cd "$REPO_DIR"
    git add .claude-memory/
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
    git commit -m "chore: memory sync from $MACHINE ($TIMESTAMP)" 2>/dev/null || true
    git push origin main 2>/dev/null && {
        log "↑ Pushed $PUSHED file(s) to Git"
    } || {
        log "⚠ Git push failed — changes committed locally, will push next time"
    }
elif [ $PULLED -eq 0 ]; then
    log "✓ Everything in sync — no changes"
fi

log "Done. Pulled: $PULLED, Pushed: $PUSHED"

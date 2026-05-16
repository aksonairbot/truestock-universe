#!/bin/bash
set -e

SERVER="root@206.189.141.160"
REMOTE="/opt/truestock-universe"
LOCAL="$HOME/Documents/Claude/Projects/Superman/truestock-universe"

echo "=== SeekPeek Deploy — Font + Theme Update ==="

# 1. Sync updated app files
echo "[1/3] Syncing app files..."

# Core: CSS, layout, tailwind config
scp "$LOCAL/apps/web/app/globals.css" "$SERVER:$REMOTE/apps/web/app/globals.css"
scp "$LOCAL/apps/web/app/layout.tsx" "$SERVER:$REMOTE/apps/web/app/layout.tsx"
scp "$LOCAL/apps/web/tailwind.config.ts" "$SERVER:$REMOTE/apps/web/tailwind.config.ts"

# New: Theme provider
scp "$LOCAL/apps/web/app/theme-provider.tsx" "$SERVER:$REMOTE/apps/web/app/theme-provider.tsx"

# New: Appearance settings section
scp "$LOCAL/apps/web/app/settings/appearance-section.tsx" "$SERVER:$REMOTE/apps/web/app/settings/appearance-section.tsx"
scp "$LOCAL/apps/web/app/settings/page.tsx" "$SERVER:$REMOTE/apps/web/app/settings/page.tsx"

# Updated: sidebar, loading, team pages, bento
scp "$LOCAL/apps/web/app/sidebar.tsx" "$SERVER:$REMOTE/apps/web/app/sidebar.tsx"
scp "$LOCAL/apps/web/app/loading.tsx" "$SERVER:$REMOTE/apps/web/app/loading.tsx"
scp "$LOCAL/apps/web/app/team/week/page.tsx" "$SERVER:$REMOTE/apps/web/app/team/week/page.tsx"
scp "$LOCAL/apps/web/app/team/month/page.tsx" "$SERVER:$REMOTE/apps/web/app/team/month/page.tsx"
scp "$LOCAL/apps/web/app/me/bento.tsx" "$SERVER:$REMOTE/apps/web/app/me/bento.tsx"
scp "$LOCAL/apps/web/app/me/dept-bento.tsx" "$SERVER:$REMOTE/apps/web/app/me/dept-bento.tsx"

# 2. Build and restart
echo "[2/3] Building..."
ssh "$SERVER" "cd $REMOTE && pnpm build"

echo "[3/3] Restarting service..."
ssh "$SERVER" "systemctl restart truestock-universe-web"

echo "=== Deploy complete! ==="

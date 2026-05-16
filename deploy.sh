#!/bin/bash
set -e

SERVER="root@206.189.141.160"
REMOTE="/opt/truestock-universe"
LOCAL="$HOME/Documents/Claude/Projects/Superman/truestock-universe"

echo "=== SeekPeek Deploy ==="

# 1. Sync key source directories
echo "[1/5] Syncing source files..."
scp -r "$LOCAL/packages/db/src/schema.ts" "$SERVER:$REMOTE/packages/db/src/schema.ts"
scp -r "$LOCAL/packages/db/drizzle/0014_review_actions.sql" "$SERVER:$REMOTE/packages/db/drizzle/"
scp -r "$LOCAL/packages/db/drizzle/0015_project_banners.sql" "$SERVER:$REMOTE/packages/db/drizzle/"
scp -r "$LOCAL/packages/db/drizzle/0016_org_settings.sql" "$SERVER:$REMOTE/packages/db/drizzle/"

# App source
scp "$LOCAL/apps/web/app/globals.css" "$SERVER:$REMOTE/apps/web/app/globals.css"
scp "$LOCAL/apps/web/app/tasks/actions.ts" "$SERVER:$REMOTE/apps/web/app/tasks/actions.ts"
scp "$LOCAL/apps/web/app/tasks/review-actions.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/review-actions.tsx"
scp "$LOCAL/apps/web/app/tasks/task-pane-content.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/task-pane-content.tsx"
scp "$LOCAL/apps/web/app/tasks/[id]/page.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/[id]/page.tsx"
scp "$LOCAL/apps/web/lib/notify.ts" "$SERVER:$REMOTE/apps/web/lib/notify.ts"

# New files from earlier sessions (attachments, error boundary, etc.)
scp "$LOCAL/apps/web/app/error.tsx" "$SERVER:$REMOTE/apps/web/app/error.tsx"
scp "$LOCAL/apps/web/app/tasks/attachment-upload.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/attachment-upload.tsx"
scp "$LOCAL/apps/web/app/tasks/task-attachments.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/task-attachments.tsx"
scp "$LOCAL/apps/web/app/tasks/new-task-form.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/new-task-form.tsx"
scp "$LOCAL/apps/web/app/tasks/page.tsx" "$SERVER:$REMOTE/apps/web/app/tasks/page.tsx"
scp "$LOCAL/apps/web/app/page.tsx" "$SERVER:$REMOTE/apps/web/app/page.tsx"
scp "$LOCAL/apps/web/app/projects/[slug]/page.tsx" "$SERVER:$REMOTE/apps/web/app/projects/[slug]/page.tsx"
scp "$LOCAL/apps/web/next.config.mjs" "$SERVER:$REMOTE/apps/web/next.config.mjs"

# Review attachments
ssh "$SERVER" "mkdir -p $REMOTE/apps/web/app/api/tasks/\[id\]/attachments $REMOTE/apps/web/app/api/attachments/\[id\] $REMOTE/apps/web/app/api/reviews/\[responseId\]/attachments"
scp "$LOCAL/apps/web/app/reviews/review-attachments.tsx" "$SERVER:$REMOTE/apps/web/app/reviews/review-attachments.tsx"
scp "$LOCAL/apps/web/app/reviews/fill/[responseId]/page.tsx" "$SERVER:$REMOTE/apps/web/app/reviews/fill/[responseId]/page.tsx"
scp "$LOCAL/apps/web/app/reviews/[cycleId]/response/[responseId]/page.tsx" "$SERVER:$REMOTE/apps/web/app/reviews/[cycleId]/response/[responseId]/page.tsx"
scp "$LOCAL/apps/web/app/reviews/actions.ts" "$SERVER:$REMOTE/apps/web/app/reviews/actions.ts"

# API routes
scp "$LOCAL/apps/web/app/api/tasks/[id]/attachments/route.ts" "$SERVER:$REMOTE/apps/web/app/api/tasks/[id]/attachments/route.ts"
scp "$LOCAL/apps/web/app/api/attachments/[id]/route.ts" "$SERVER:$REMOTE/apps/web/app/api/attachments/[id]/route.ts"
scp "$LOCAL/apps/web/app/api/reviews/[responseId]/attachments/route.ts" "$SERVER:$REMOTE/apps/web/app/api/reviews/[responseId]/attachments/route.ts"

# Organisation settings
ssh "$SERVER" "mkdir -p $REMOTE/apps/web/app/settings/organisation"
scp "$LOCAL/apps/web/app/settings/page.tsx" "$SERVER:$REMOTE/apps/web/app/settings/page.tsx"
scp "$LOCAL/apps/web/app/settings/org-actions.ts" "$SERVER:$REMOTE/apps/web/app/settings/org-actions.ts"
scp "$LOCAL/apps/web/app/settings/organisation/page.tsx" "$SERVER:$REMOTE/apps/web/app/settings/organisation/page.tsx"
scp "$LOCAL/apps/web/app/settings/organisation/org-settings-form.tsx" "$SERVER:$REMOTE/apps/web/app/settings/organisation/org-settings-form.tsx"

# Members actions (security fix)
scp "$LOCAL/apps/web/app/members/actions.ts" "$SERVER:$REMOTE/apps/web/app/members/actions.ts"

# 2. Sync banner images
echo "[2/5] Syncing banner images..."
scp "$LOCAL/apps/web/public/banners/ai.png" "$SERVER:$REMOTE/apps/web/public/banners/"
scp "$LOCAL/apps/web/public/banners/high.png" "$SERVER:$REMOTE/apps/web/public/banners/"

# 3. Run migrations
echo "[3/5] Running migrations..."
ssh "$SERVER" "cd $REMOTE && export \$(grep DATABASE_URL .env) && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/0013_review_attachments.sql 2>&1 || true && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/0014_review_actions.sql 2>&1 || true && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/0015_project_banners.sql 2>&1 || true && \
  psql \"\$DATABASE_URL\" -f packages/db/drizzle/0016_org_settings.sql 2>&1"

# 4. Create uploads directory
echo "[4/5] Ensuring uploads directory exists..."
ssh "$SERVER" "mkdir -p /opt/truestock-universe/uploads"

# 5. Build and restart
echo "[5/5] Building and restarting..."
ssh "$SERVER" "cd $REMOTE && pnpm build && systemctl restart truestock-universe-web"

echo "=== Deploy complete! ==="

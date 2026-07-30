#!/usr/bin/env bash
# ============================================================
# SeekPeak — fix the live server configuration (v2)
# ============================================================
# v1 wrote CRON_SECRET into /opt/truestock-universe/.env and the app still
# said {"error":"CRON_SECRET not configured"} — because that is NOT where the
# running service gets its environment. auth.ts gives the clue: it tells you to
# set AUTH_SECRET "in .env (or /etc/truestock/env on the server)". The systemd
# unit supplies the runtime env via EnvironmentFile, and Next reads a build-time
# .env from apps/web. There are up to three places that matter and they must
# agree.
#
# So v2 DISCOVERS where the environment actually comes from — it parses the
# systemd unit instead of assuming — then writes the same values to every
# relevant file, using ONE secret value across all of them.
#
# What it fixes:
#   1. NEXT_PUBLIC_APP_URL → https://seekpeak.in
#      (raw IP over http broke the signed media links the publisher needs;
#       NEXT_PUBLIC_* is inlined at BUILD time, hence the rebuild)
#   2. CRON_SECRET → generated once if absent, reused if already present
#      (without it every /api/cron/* route 500s: no daily review, no
#       recurring-task roll-forward, no briefing pre-warm, no publish sweep)
#   3. Installs the crontab entries, which never existed at all
#
# Idempotent. Safe to run repeatedly.
#
# Run from a machine that can SSH to the droplet (the Mac Mini):
#   bash fix-server-config.sh
# ============================================================

set -euo pipefail

SERVER="root@206.189.141.160"
REMOTE="/opt/truestock-universe"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PARENT="$(cd .. && pwd -P)"

KEY="$PARENT/.cowork-ssh/id_ed25519"
KNOWN="$PARENT/.cowork-ssh/known_hosts"
if [ -f "$KEY" ]; then
    chmod 600 "$KEY" 2>/dev/null || true
    SSH_CMD="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$KNOWN -o ConnectTimeout=15"
else
    SSH_CMD="ssh -o ConnectTimeout=15"
fi

echo ""
echo "======================================"
echo "  SeekPeak — server config fix (v2)"
echo "======================================"

echo "[0/4] Checking connection..."
if ! $SSH_CMD "$SERVER" "echo ok" >/dev/null 2>&1; then
    echo "  ✗ Cannot reach $SERVER — nothing was changed."
    exit 1
fi
echo "  ✓ connected"

echo "[1/4] Finding where the environment really comes from, then fixing it..."
$SSH_CMD "$SERVER" 'bash -s' <<'REMOTE'
set -uo pipefail
ROOT=/opt/truestock-universe
WANT_URL="https://seekpeak.in"
UNIT=truestock-universe-web

echo ""
echo "  --- systemd environment sources ---"
systemctl cat "$UNIT" 2>/dev/null | grep -iE '^(EnvironmentFile|Environment)=' | sed 's/^/    /' || echo "    (none declared in the unit)"

# EnvironmentFile= may be prefixed with "-" (optional). Strip it.
UNIT_FILES="$(systemctl cat "$UNIT" 2>/dev/null | sed -n 's/^EnvironmentFile=-\?//p' | tr -d '"' | sed 's/[[:space:]]*$//')"

# Candidates, in the order they matter:
#   * whatever the unit declares  → RUNTIME env (this is what was missing)
#   * $ROOT/.env                  → what deploy.sh greps, and the cron runner
#   * $ROOT/apps/web/.env         → what `next build` inlines NEXT_PUBLIC_* from
CANDIDATES=""
for f in $UNIT_FILES; do CANDIDATES="$CANDIDATES $f"; done
CANDIDATES="$CANDIDATES $ROOT/.env $ROOT/apps/web/.env"

echo ""
echo "  --- candidate env files ---"
for f in $CANDIDATES; do
    if [ -f "$f" ]; then
        printf '    %-45s exists   CRON_SECRET:%s  APP_URL:%s\n' "$f" \
            "$(grep -q '^CRON_SECRET=' "$f" && echo yes || echo no)" \
            "$(grep -q '^NEXT_PUBLIC_APP_URL=' "$f" && echo yes || echo no)"
    else
        printf '    %-45s MISSING\n' "$f"
    fi
done

# ---- decide on ONE secret and reuse it everywhere ----
SECRET=""
for f in $CANDIDATES; do
    [ -f "$f" ] || continue
    V="$(sed -n 's/^CRON_SECRET=//p' "$f" | head -1 | tr -d '"'"'"'')"
    if [ -n "$V" ]; then SECRET="$V"; break; fi
done
if [ -z "$SECRET" ]; then
    SECRET="$(openssl rand -hex 32)"
    echo ""
    echo "  cron secret: generated a new one (value not displayed)"
else
    echo ""
    echo "  cron secret: reusing the existing value found on disk"
fi

# upsert KEY="value" into a file, creating the file if needed.
upsert() {
    file="$1"; key="$2"; val="$3"
    mkdir -p "$(dirname "$file")"
    [ -f "$file" ] || { : > "$file"; chmod 600 "$file"; echo "    created $file"; }
    if grep -q "^${key}=" "$file"; then
        cur="$(sed -n "s/^${key}=//p" "$file" | head -1 | tr -d '"'"'"'')"
        if [ "$cur" = "$val" ]; then return 0; fi
        # A literal | can't appear in a URL or hex secret, so it's a safe delimiter.
        sed -i "s|^${key}=.*|${key}=\"${val}\"|" "$file"
        echo "    $file: $key updated"
    else
        printf '\n%s="%s"\n' "$key" "$val" >> "$file"
        echo "    $file: $key added"
    fi
}

echo ""
echo "  --- writing ---"
for f in $CANDIDATES; do
    # Only create files the unit actually references; don't invent stray .env
    # files that nothing reads.
    if [ ! -f "$f" ]; then
        SHOULD_CREATE=no
        for u in $UNIT_FILES; do [ "$u" = "$f" ] && SHOULD_CREATE=yes; done
        [ "$SHOULD_CREATE" = yes ] || { echo "    skipping $f (does not exist and nothing references it)"; continue; }
    fi
    BAK="$f.bak.$(date +%Y%m%d%H%M%S)"
    [ -f "$f" ] && cp "$f" "$BAK" 2>/dev/null && echo "    backup $BAK"
    upsert "$f" NEXT_PUBLIC_APP_URL "$WANT_URL"
    upsert "$f" CRON_SECRET "$SECRET"
done

# ---- cron runner: reads the secret from the SAME files the service does ----
# The discovered env-file list is written to disk rather than substituted into
# the script — placeholder substitution through three layers of quoting is how
# you ship a runner that silently does nothing.
mkdir -p "$ROOT/bin"
printf '%s\n' $CANDIDATES > "$ROOT/bin/cron-env-files"

cat > "$ROOT/bin/seekpeak-cron.sh" <<'RUNNER'
#!/bin/bash
# Calls a SeekPeak cron endpoint with the shared secret.
# The secret lives in an env file, NOT in crontab, so `crontab -l` and the
# process list never expose it.
# Usage: seekpeak-cron.sh <job>    e.g. daily-review | publish
set -u
ROOT=/opt/truestock-universe
LOG=/var/log/seekpeak-cron.log
LIST="$ROOT/bin/cron-env-files"
JOB="${1:-daily-review}"

SECRET=""
PORT=""
if [ -f "$LIST" ]; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -f "$f" ] || continue
    if [ -z "$SECRET" ]; then
      SECRET=$(sed -n 's/^CRON_SECRET=//p' "$f" | head -1 | tr -d '"' | tr -d "'")
    fi
    if [ -z "$PORT" ]; then
      PORT=$(sed -n 's/^PORT=//p' "$f" | head -1 | tr -d '"' | tr -d "'")
    fi
  done < "$LIST"
fi
[ -n "$PORT" ] || PORT=3000

if [ -z "$SECRET" ]; then
  echo "$(date -Is) $JOB SKIPPED: no CRON_SECRET found in $LIST" >> "$LOG"
  exit 0
fi

OUT=$(mktemp)
CODE=$(curl -s -o "$OUT" -w "%{http_code}" -m 900 \
  -H "x-cron-secret: $SECRET" \
  "http://127.0.0.1:$PORT/api/cron/$JOB" || echo 000)
echo "$(date -Is) $JOB http=$CODE $(head -c 500 "$OUT")" >> "$LOG"
rm -f "$OUT"
RUNNER
chmod +x "$ROOT/bin/seekpeak-cron.sh"
echo "    runner: $ROOT/bin/seekpeak-cron.sh"
echo "    env files it reads:"
sed 's/^/      /' "$ROOT/bin/cron-env-files"

# ---- crontab, idempotent via a marker comment ----
TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v '# seekpeak-cron' > "$TMP" || true
cat >> "$TMP" <<'CRONLINES'
# 03:30 UTC = 09:00 IST — daily review, recurring-task roll-forward, digest, briefing pre-warm
30 3 * * * /opt/truestock-universe/bin/seekpeak-cron.sh daily-review # seekpeak-cron
# Publish sweep. A no-op unless PUBLISH_ENABLED="true", so this is safe to run.
*/15 * * * * /opt/truestock-universe/bin/seekpeak-cron.sh publish # seekpeak-cron
CRONLINES
crontab "$TMP"
rm -f "$TMP"
echo ""
echo "  --- crontab ---"
crontab -l | grep 'seekpeak-cron' | grep -v '^#' | sed 's/^/    /' || true
REMOTE

echo ""
echo "[2/4] Rebuilding (NEXT_PUBLIC_APP_URL is inlined at build time)..."
$SSH_CMD "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev; if [ -d .next ]; then cp -a .next .next.prev; fi" || true

if ! $SSH_CMD "$SERVER" "cd $REMOTE && pnpm build"; then
    echo ""
    echo "  ✗ BUILD FAILED — restoring the previous build"
    $SSH_CMD "$SERVER" "cd $REMOTE/apps/web && if [ -d .next.prev ]; then rm -rf .next && mv .next.prev .next; fi" || true
    $SSH_CMD "$SERVER" "systemctl restart truestock-universe-web" || true
    echo "  Site restored. The env changes ARE saved; re-run after fixing the build."
    exit 1
fi
$SSH_CMD "$SERVER" "cd $REMOTE/apps/web && rm -rf .next.prev" || true

echo "[3/4] Restarting..."
$SSH_CMD "$SERVER" "systemctl restart truestock-universe-web"
sleep 5
STATUS=$($SSH_CMD "$SERVER" "systemctl is-active truestock-universe-web" || echo unknown)

echo "[4/4] Verifying..."
# The publish sweep is the safe endpoint to test with: without PUBLISH_ENABLED
# it returns immediately with "auto-publish disabled" and posts nothing.
CRON_TEST=$($SSH_CMD "$SERVER" "/opt/truestock-universe/bin/seekpeak-cron.sh publish >/dev/null 2>&1; tail -1 /var/log/seekpeak-cron.log" || echo "(no log)")

# Check a real asset, not just that a page 200s — the outage that looked like
# "login is broken" was HTML loading while every JS chunk 400'd.
HTML=$(curl -fsS -m 20 https://seekpeak.in/welcome || true)
ASSET=$(printf '%s' "$HTML" | grep -o '/_next/static/chunks/app/layout-[^"]*\.js' | head -1)
ASSET_MSG="? could not read the page"
if [ -n "$ASSET" ]; then
    CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://seekpeak.in$ASSET")
    [ "$CODE" = "200" ] && ASSET_MSG="✓ assets serving (200)" || ASSET_MSG="✗ asset returned $CODE"
fi

echo ""
echo "======================================"
echo "  Service: $STATUS"
echo "  Assets:  $ASSET_MSG"
echo "  Cron:    $CRON_TEST"
echo ""
echo "  Want: http=200 with \"auto-publish disabled\"."
echo "    500 → the service still can't see CRON_SECRET; send me the"
echo "          \"systemd environment sources\" block printed above."
echo "    401 → the runner and the app are reading different files."
echo ""
echo "  Then open https://seekpeak.in/settings/health"
echo "======================================"

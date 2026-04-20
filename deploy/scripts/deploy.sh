#!/usr/bin/env bash
#
# Truestock Universe — on-droplet deploy.
# Pulls latest main, installs, builds, migrates, restarts the web service.
#
# Called by:
#   - CI (.github/workflows/deploy.yml) on push to main
#   - Manually on the droplet:  sudo /opt/truestock-universe/deploy/scripts/deploy.sh
#
# Safe to run repeatedly. Restarts the web service with zero-ish downtime
# (~2 seconds) — systemd kills + restarts, Caddy returns 502 briefly.

set -euo pipefail

APP_DIR="/opt/truestock-universe"
APP_USER="truestock"
ENV_FILE="/etc/truestock/env"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# Preflight
[[ -d "$APP_DIR" ]] || fail "$APP_DIR not found — run provision.sh first"
[[ -f "$ENV_FILE" ]] || fail "$ENV_FILE not found"
id -u "$APP_USER" >/dev/null 2>&1 || fail "user $APP_USER does not exist"

# All git/pnpm work runs as the app user
run_as_app() {
  sudo -iu "$APP_USER" bash -c "cd $APP_DIR && $*"
}

log "pulling latest main"
run_as_app "git fetch --all --quiet"
run_as_app "git reset --hard origin/main"

log "installing deps"
run_as_app "pnpm install --frozen-lockfile --prefer-offline"

log "building web"
run_as_app "pnpm build --filter=web"

log "applying migrations"
# Source env file for DATABASE_URL
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
sudo -u "$APP_USER" --preserve-env=DATABASE_URL bash -c "cd $APP_DIR && pnpm db:migrate"

log "restarting web service"
systemctl restart truestock-universe-web

# Wait for health check
log "waiting for health check"
for i in {1..30}; do
  if curl -sf -o /dev/null -m 2 http://localhost:3000/mis/revenue; then
    log "✓ service is up (attempt $i)"
    exit 0
  fi
  sleep 1
done

fail "service did not come up within 30 seconds — check journalctl -u truestock-universe-web"

#!/usr/bin/env bash
#
# Truestock Universe — one-time droplet provisioning.
# Run as root on a fresh Ubuntu 24.04 LTS droplet.
#
#   bash /path/to/this/repo/deploy/scripts/provision.sh
#
# Assumes: the repo is already cloned somewhere reachable (we'll move it to
# /opt/truestock-universe as part of this script).

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/truestock/truestock-universe.git}"
APP_DIR="/opt/truestock-universe"
APP_USER="truestock"
ENV_DIR="/etc/truestock"

# Running as root check
if [[ $EUID -ne 0 ]]; then
  echo "error: must run as root" >&2
  exit 1
fi

# OS check — we target Ubuntu 24.04
if ! grep -q 'Ubuntu 24' /etc/os-release 2>/dev/null; then
  echo "warning: this script is designed for Ubuntu 24.04. Continuing anyway..."
fi

echo "==> updating apt"
DEBIAN_FRONTEND=noninteractive apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

echo "==> installing essentials"
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  curl git ufw unattended-upgrades ca-certificates \
  debian-keyring debian-archive-keyring apt-transport-https \
  postgresql-client

echo "==> installing Node 22 via NodeSource"
if ! command -v node >/dev/null || ! node -v | grep -q 'v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
corepack enable
corepack prepare pnpm@9.12.0 --activate

echo "==> installing Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
fi

echo "==> creating app user + directory"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$APP_USER"
fi
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> cloning repo (or updating if present)"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch --all
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
else
  # If the script is already inside the repo (being run from a clone), use that
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  if [[ -f "$REPO_ROOT/turbo.json" ]]; then
    cp -r "$REPO_ROOT/." "$APP_DIR/"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  else
    sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
  fi
fi

echo "==> installing deps + building"
sudo -iu "$APP_USER" bash -c "cd $APP_DIR && pnpm install --frozen-lockfile"
sudo -iu "$APP_USER" bash -c "cd $APP_DIR && pnpm build --filter=web"

echo "==> env directory"
mkdir -p "$ENV_DIR"
if [[ ! -f "$ENV_DIR/env" ]]; then
  cp "$APP_DIR/deploy/env.template" "$ENV_DIR/env"
fi
chmod 600 "$ENV_DIR/env"
chown "$APP_USER:$APP_USER" "$ENV_DIR/env"

echo "==> installing systemd units"
cp "$APP_DIR/deploy/systemd/"*.service /etc/systemd/system/
cp "$APP_DIR/deploy/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload

echo "==> installing Caddyfile"
mkdir -p /etc/caddy /var/log/caddy
# Default to HTTP-only config (works with bare IP, no DNS needed).
# Swap to Caddyfile (with hostname + auto Let's Encrypt) after DNS propagates.
if [[ -f "$APP_DIR/deploy/caddy/Caddyfile.http" ]]; then
  cp "$APP_DIR/deploy/caddy/Caddyfile.http" /etc/caddy/Caddyfile
  echo "   (installed HTTP-only config — swap to Caddyfile + set hostname once DNS is ready)"
else
  cp "$APP_DIR/deploy/caddy/Caddyfile" /etc/caddy/Caddyfile
fi
chown -R caddy:caddy /var/log/caddy
systemctl enable caddy
systemctl restart caddy

echo "==> firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'ssh'
ufw allow 80/tcp   comment 'http (caddy)'
ufw allow 443/tcp  comment 'https (caddy)'
ufw --force enable

echo "==> enabling unattended security upgrades"
echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades

cat <<EOM

════════════════════════════════════════════════════════════════════════
  Provisioning complete.
════════════════════════════════════════════════════════════════════════

Next steps:

  1. Edit the env file with your real secrets:
       sudoedit /etc/truestock/env

  2. Point DNS at this droplet and update the hostname in Caddyfile:
       sudoedit /etc/caddy/Caddyfile
       sudo systemctl reload caddy

  3. Run migrations + seed:
       sudo -iu ${APP_USER} bash -c "cd ${APP_DIR} && pnpm db:generate && pnpm db:migrate && pnpm db:seed"

  4. Start services:
       sudo systemctl enable --now truestock-universe-web
       sudo systemctl enable --now truestock-sync-razorpay.timer
       sudo systemctl enable --now truestock-metrics.timer

  5. Watch logs:
       sudo journalctl -u truestock-universe-web -f

  6. Add the Razorpay webhook pointing at:
       https://<your-hostname>/api/webhooks/razorpay

See deploy/README.md for the full walkthrough.
EOM

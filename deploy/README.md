# Truestock Universe · Droplet deploy

Self-hosted on a DigitalOcean Basic Regular droplet (1 vCPU, 2 GB, 50 GB, $12/mo)
with DO Managed Postgres Dev ($7/mo) attached. **Total: $19/mo.**

Stack on the box:
- **Ubuntu 24.04 LTS**
- **Node 22** (via NodeSource)
- **pnpm 9** (via corepack)
- **Caddy** — reverse proxy with automatic Let's Encrypt TLS
- **systemd** — web service + cron timers (no PM2, no cron, no Docker)
- **UFW firewall** — 22/80/443 only

Everything under `/opt/truestock-universe`, owned by the `truestock` user.

---

## Files in this directory

```
deploy/
├── README.md                          (this file)
├── scripts/
│   ├── provision.sh                   one-time bootstrap on a fresh droplet
│   └── deploy.sh                      on-droplet deploy (pulled by CI or run manually)
├── caddy/
│   └── Caddyfile                      reverse proxy + TLS
├── systemd/
│   ├── truestock-universe-web.service    long-running Next.js process
│   ├── truestock-sync-razorpay.service   hourly Razorpay reconciliation (cron)
│   ├── truestock-sync-razorpay.timer     ↳ schedule
│   ├── truestock-metrics.service         nightly metrics_daily rollup (cron)
│   └── truestock-metrics.timer           ↳ schedule
└── env.template                       copy to /etc/truestock/env and fill in
```

Plus: `../.github/workflows/deploy.yml` — triggered on push to main.

---

## 0. Before you start

You need:

1. A DigitalOcean account with a payment method added
2. A **DO SSH key** added to your account (Settings → Security → Add SSH Key)
3. A domain name you can point at the droplet (e.g. `universe.truestock.in`)
4. A Razorpay test account with keys generated

---

## 1. Provision the droplet

From DO dashboard:

- **Create → Droplet**
- Image: **Ubuntu 24.04 (LTS) x64**
- Region: **Bangalore (BLR1)**
- Plan: **Basic → Regular → $12/mo** (1 vCPU, 2 GB, 50 GB SSD)
- Authentication: **SSH Key** (select yours)
- Hostname: `truestock-universe-prod`
- Enable: **backups** ($2.40/mo — optional but recommended at this scale)

Once it boots, SSH in as root:

```bash
ssh root@<droplet_ip>
```

---

## 2. Create the Managed Postgres (Dev tier)

Also from DO dashboard:

- **Create → Databases**
- Engine: **PostgreSQL 16**
- Plan: **Development Database — $7/mo**
- Region: **Bangalore (BLR1)** — same as droplet, for low latency
- Name: `truestock-db`

Once it's ready:

- Copy the **Connection Pool → Public network → Connection string** (append `?sslmode=require` if not present)
- In the database's **Settings → Trusted Sources**, add the droplet so only it can connect

Keep this string handy — it goes into `/etc/truestock/env` as `DATABASE_URL`.

---

## 3. Run the provisioning script

On the droplet, still as root:

```bash
# Clone the repo
git clone https://github.com/truestock/truestock-universe.git /tmp/tu
bash /tmp/tu/deploy/scripts/provision.sh
```

This installs Node, pnpm, Caddy, UFW, and lays down:
- `/opt/truestock-universe` (app)
- `/etc/truestock/env` (secrets — empty, you fill it)
- `/etc/caddy/Caddyfile`
- systemd units in `/etc/systemd/system/`
- UFW rules (22/80/443 only)

Takes ~3 minutes on a fresh droplet.

---

## 4. Fill in secrets

Open `/etc/truestock/env` and paste the connection string + all other env vars:

```bash
sudoedit /etc/truestock/env
```

Use the template at `deploy/env.template` as a starting point. Required values:
`DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`INTERNAL_API_SECRET`, `NEXT_PUBLIC_APP_URL`.

Permissions: should already be `600`, owned by `truestock:truestock`.

---

## 5. Point your domain at the droplet

At your DNS provider, add an A record:

```
universe.truestock.in.    A    <droplet_ip>
```

Update the `Caddyfile` on the droplet if the hostname differs:

```bash
sudoedit /etc/caddy/Caddyfile   # change `universe.truestock.in` to your host
sudo systemctl reload caddy
```

Caddy handles Let's Encrypt automatically once DNS propagates (~1 minute).

---

## 6. Migrate + seed + start

```bash
# switch to app user
sudo -iu truestock
cd /opt/truestock-universe

# Drizzle generates + applies migrations
pnpm db:generate
pnpm db:migrate

# Seed products + price mappings
pnpm db:seed

# Exit back to root
exit

# Start everything
sudo systemctl enable --now truestock-universe-web.service
sudo systemctl enable --now truestock-sync-razorpay.timer
sudo systemctl enable --now truestock-metrics.timer
```

Verify:

```bash
systemctl status truestock-universe-web
systemctl list-timers | grep truestock
curl -I https://universe.truestock.in/mis/revenue
```

You should see the dashboard render at your domain.

---

## 7. Set up CI deploys

On your laptop, create a dedicated SSH key for GitHub Actions:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tu_deploy -C "tu_deploy" -N ""
```

Copy the public key onto the droplet:

```bash
ssh root@<droplet_ip> "sudo -iu truestock bash -c 'echo $(cat ~/.ssh/tu_deploy.pub) >> ~/.ssh/authorized_keys'"
```

In GitHub → Settings → Secrets and variables → Actions, add:

- `DROPLET_HOST` — droplet IP or hostname
- `DROPLET_SSH_KEY` — contents of `~/.ssh/tu_deploy` (private key)

Now every push to `main` triggers `.github/workflows/deploy.yml`, which
SSHes in, pulls, installs, builds, migrates, and restarts the service.

---

## 8. Wire up the Razorpay webhook

Once the public URL is reachable:

1. In Razorpay dashboard (Test mode first): **Settings → Webhooks → Add New Webhook**
2. URL: `https://universe.truestock.in/api/webhooks/razorpay`
3. Secret: paste the same value you put in `/etc/truestock/env` as `RAZORPAY_WEBHOOK_SECRET`
4. Subscribe to: `payment.captured`, `payment.failed`, `payment.authorized`, `subscription.*`, `refund.created`, `refund.processed`
5. Save + send a test event; verify it lands in `razorpay_events` table

See `docs/razorpay-go-live.md` for the full test → live rollout.

---

## Operations

### Logs

```bash
# web service — last 100 lines + follow
sudo journalctl -u truestock-universe-web -n 100 -f

# cron jobs (last runs)
sudo journalctl -u truestock-sync-razorpay -n 50
sudo journalctl -u truestock-metrics -n 50

# caddy / TLS
sudo journalctl -u caddy -n 50
```

### Restart / redeploy manually

```bash
# just the web
sudo systemctl restart truestock-universe-web

# pull + build + migrate + restart (what CI does)
sudo /opt/truestock-universe/deploy/scripts/deploy.sh
```

### Trigger a cron run right now

```bash
sudo systemctl start truestock-sync-razorpay.service
sudo systemctl start truestock-metrics.service
```

### Rotate secrets

```bash
sudoedit /etc/truestock/env
sudo systemctl restart truestock-universe-web
# cron jobs pick up new env on their next run automatically
```

### OS updates

DO's unattended-upgrades is configured by `provision.sh` to auto-apply
security updates daily. For kernel updates (which require reboot), check
and reboot during a maintenance window:

```bash
ls /var/run/reboot-required 2>/dev/null && sudo reboot
```

---

## If something breaks

See `docs/runbook.md` for triage of: webhook failures, unmapped payments,
stale dashboard, stuck sync, failed events, migration failures, rotations.

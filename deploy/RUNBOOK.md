# Runbook — Margix IMS, home server

The stack runs under **rootless Podman** on the host, alongside unrelated
stacks. It publishes no host port: a Tailscale sidecar joins the tailnet as its
own device and proxies inward, and Funnel puts that hostname on the public
internet over HTTPS.

```
  internet ──▶ Tailscale Funnel ──▶ margix-ts-1 ──▶ margix-app-1 ──▶ margix-postgres-1
                                    (sidecar)       (Next.js :3000)   (db_data volume)
                                                    margix-tally-sync-1 ──┤
                                                    margix-notify-1 ──────┘
```

`margix-notify-1` runs the notification worker every `NOTIFY_INTERVAL`
seconds (slow-moving scan, digests, e-mail/WhatsApp/in-app delivery). Check it
with `podman logs -f margix-notify-1`; channel setup is in docs/operations.md.

| | |
|---|---|
| Host | `homeserver`, user `shivam` |
| Checkout | `~/apps/Margix-IMS` |
| Compose | `deploy/compose.prod.yml`, project name `margix`, network `margix_net` |
| Deploy | `deploy/deploy.sh` (fast: host build → mounted release → restart) |
| URL | `https://margix.tailc73ec8.ts.net` (public) |
| Data | volume `margix_db_data` — the production database |
| Identity | volume `margix_ts_state` — the tailnet device. Do not delete: the node rejoins with a `-1` suffix and the URL changes. |
| Secrets | `deploy/.env.production` (mode 600, never committed) |

Not to be confused with the **development** database: container
`margix-postgres` with volume `margix_pgdata`, on `127.0.0.1:15432`. The
production stack never touches it.

## First install

```bash
cd ~/apps/Margix-IMS/deploy
cp .env.production.example .env.production && chmod 600 .env.production
# set the passwords (openssl rand -hex 24), SEED_ADMIN_*, optionally TS_AUTHKEY
cd .. && deploy/deploy.sh --rebuild-images        # images once, then the app
podman compose -f deploy/compose.prod.yml --env-file deploy/.env.production run --rm seed
```

Without `TS_AUTHKEY`, enrol the sidecar once: `podman logs -f margix-ts-1`
prints a login URL — open it and approve the device. The identity then lives
in `margix_ts_state`.

Then install the unit that restarts it after a reboot:

```bash
mkdir -p ~/.config/systemd/user
cp deploy/margix.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now margix.service
```

## Deploy a new version (fast)

```bash
cd ~/apps/Margix-IMS && git pull     # or deploy what is checked out
deploy/deploy.sh
```

About 30–90 seconds. The app is built on the host with a warm build cache
(`.next-release/`), assembled into `deploy/.release.new`, migrations run from
it, then it is swapped into `deploy/release/` (mounted read-only into the
`app`, `migrate` and `tally-sync` containers) and those restart. If the build
or a migration fails, nothing is swapped and the running version keeps
serving. The container images (`margix-ims-runtime`: Node + OpenSSL + Prisma
CLI; `margix-ims-tools`: seed) only need rebuilding after a Node/base-image or
dependency change: `deploy/deploy.sh --rebuild-images`.

## Check it

```bash
podman compose -f compose.prod.yml --env-file .env.production ps
curl -s https://margix.tailc73ec8.ts.net/api/ready      # {"status":"ready","database":"ok",…}
podman logs --tail 50 margix-app-1                       # JSON lines, one per API request
podman logs --tail 20 margix-ts-1
```

## Backups

```bash
cd ~/apps/Margix-IMS
PG_CONTAINER=margix-postgres-1 BACKUP_DIR=~/backups/margix ops/backup/backup.sh
PG_CONTAINER=margix-postgres-1 ops/backup/verify-restore.sh ~/backups/margix/margix-<timestamp>.dump
```

For nightly backups, install `ops/systemd/margix-backup.{service,timer}` and
set `PG_CONTAINER=margix-postgres-1` in the service (see docs/operations.md).

## Users and passwords

Only the administrator from `SEED_ADMIN_*` exists after the seed; create the
other users under Admin → Users. A lost admin password is reset by another
admin from the Users screen.

## Stop / remove

```bash
podman compose -f compose.prod.yml --env-file .env.production stop     # keeps data
podman compose -f compose.prod.yml --env-file .env.production down     # keeps volumes
```

Never add `-v` to `down` unless you mean to delete the database and the tailnet
identity.

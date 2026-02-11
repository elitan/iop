# Demo Instance Runbook

## Local env
Add to `/Users/johan/code/elitan/frost/.env`:

```bash
HETZNER_API_KEY=...
CLOUDFLARE_API_TOKEN=...
DEMO_EMAIL=...
DEMO_PASSWORD=...
DEMO_DOMAIN=demo.frost.build
```

## One command for first setup

```bash
cd /Users/johan/code/elitan/frost
./apps/app/scripts/manage-demo-instance.sh bootstrap
```

This does:
1. Provision Hetzner VPS.
2. Install Frost.
3. Set DNS (`demo.frost.build` + `*.demo.frost.build`).
4. Enable SSL + wildcard in Frost.
5. Enable `FROST_DEMO_MODE=true`.
6. Install hourly reset timer.

Output includes:
- `server_id`
- `server_ip`
- `install_api_key`
- `demo_url`

Save these.

## Future commands

Re-run domain/wildcard config:

```bash
SERVER_IP=<server_ip> INSTALL_API_KEY=<install_api_key> ./apps/app/scripts/manage-demo-instance.sh configure
```

Re-install/reset timer config:

```bash
SERVER_IP=<server_ip> ./apps/app/scripts/manage-demo-instance.sh install-timer
```

Run reset now:

```bash
SERVER_IP=<server_ip> ./apps/app/scripts/manage-demo-instance.sh reset-now
```

Delete one demo server:

```bash
./apps/app/scripts/manage-demo-instance.sh delete --server-id <server_id>
```

Delete all servers labeled `purpose=frost-demo`:

```bash
./apps/app/scripts/manage-demo-instance.sh delete
```

## Marketing env
Set in marketing deploy env:

```bash
NEXT_PUBLIC_DEMO_URL=https://demo.frost.build
NEXT_PUBLIC_DEMO_PASSWORD=<same demo password>
```

## Hourly reset details
Hourly timer runs `frost-demo-reset.service`.

Safety gates:
1. `/etc/frost-demo.env` must have `DEMO_ENV=demo`.
2. Frost `settings.domain` must equal `demo.frost.build`.

Reset keeps:
- password/login
- domain + SSL settings
- wildcard + dns settings
- demo mode (`FROST_DEMO_MODE=true`)

Reset clears:
- projects/services/deployments
- registries
- github installs
- oauth clients/codes/tokens
- api keys
- metrics

Then reseeds one `demo-hello` project/service.

## Demo mode locks
- password/setup changes
- domain/ssl/wildcard changes
- github app setup + webhooks
- registry/api key/mcp token changes
- oauth client/token write actions
- update/apply + auto-update changes
- cleanup settings/manual cleanup
- rollback deploy

Demo limits:
- max 5 projects
- max 3 envs/project
- max 8 services/env
- max 1 replica/service
- max cpu 2
- max memory 2g
- max 10 deploys/service/10min
- login rate limit: 30 failed/min per IP

## Useful checks

```bash
ssh root@<server_ip> "systemctl status frost-demo-reset.timer --no-pager"
ssh root@<server_ip> "journalctl -u frost-demo-reset.service -n 200 --no-pager"
ssh root@<server_ip> "tail -n 200 /opt/frost/data/demo-reset.log"
```

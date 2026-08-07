# VPS deploy (Contabo / any Ubuntu box)

API + Postgres + Caddy on one VPS. Frontend stays on Cloudflare Pages.

Files live in [`deploy/vps/`](../deploy/vps/).

## What you need

- Ubuntu 22.04/24.04 VPS (4 vCPU / 8 GB is enough for Glaux + a few other Docker apps)
- Domain with an `A` record for the API (e.g. `api.yourdomain.com` → VPS IP)
- Docker Engine + Compose plugin
- This repo cloned on the server

## 1. Server basics

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # re-login after this

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. DNS

| Record | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | `api` | VPS IP | **DNS only** (grey cloud) so Caddy can get a Let's Encrypt cert |
| A/CNAME | `@` or `app` | Cloudflare Pages | Proxied is fine |

## 3. Configure

```bash
git clone YOUR_REPO glaux-ledger
cd glaux-ledger/deploy/vps
cp .env.example .env
nano .env
```

Set at least:

```
API_DOMAIN=api.yourdomain.com
CORS_ORIGINS=https://your-pages.pages.dev,https://ledger.yourdomain.com
JWT_SECRET=…          # python3 -c "import secrets; print(secrets.token_urlsafe(48))"
POSTGRES_PASSWORD=…   # python3 -c "import secrets; print(secrets.token_urlsafe(24))"
GLAUX_APP_PASSWORD=…  # different from POSTGRES_PASSWORD
```

`POSTGRES_PASSWORD` is the owner role (migrations + admin review).
`GLAUX_APP_PASSWORD` is the RLS-enforced API role. They must differ. Use URL-safe
secrets so special characters do not break `DATABASE_URL`.

## 4. Start

From `deploy/vps/`:

```bash
chmod +x up.sh postgres/init/01-app-role.sh
./up.sh
```

Or manually:

```bash
docker compose up -d --build
curl https://api.yourdomain.com/health
```

## 5. Admin user

```bash
docker compose exec api python platform_admin.py create you@yourco.com --role admin
```

Sign in at `https://your-frontend/admin/login`.

## 6. Frontend (Cloudflare Pages)

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output | `dist` |
| `VITE_API_BASE_URL` | `https://api.yourdomain.com` (no trailing slash) |

Redeploy Pages after the API URL is final. If you change `CORS_ORIGINS`, recreate the API container:

```bash
docker compose up -d api --force-recreate
```

## Day-2 commands

```bash
cd deploy/vps
docker compose logs -f api
docker compose ps
docker compose pull && docker compose up -d --build   # after git pull
docker compose exec api python platform_admin.py list
```

Backups (run from a machine that is **not** only this VPS, or sync dumps off-box):

```bash
# on the VPS, using the owner URL from .env
docker compose exec api python backup.py dump --to /tmp/backups --keep 14
```

Prefer mounting a host folder or `scp`/`rclone` the dumps elsewhere. Contabo’s one snapshot is a rollback aid, not a backup strategy.

## Hosting other apps on the same VPS

Add more Compose projects under `~/apps/…` and either:

- give each its own Caddy (different host ports — messy), or
- extend [`Caddyfile`](../deploy/vps/Caddyfile) with more site blocks pointing at other containers on the same Docker network.

Leave a couple of GB free; watch with `docker stats`.

## Layout

| Service | Role |
| --- | --- |
| `db` | Postgres 17, roles `glaux` + `glaux_app` |
| `api` | FastAPI image; migrations on start; **not** published on the host |
| `caddy` | HTTPS on 80/443 → `api:8000` |

Port 8000 stays internal so `X-Forwarded-For` is only trusted from Caddy.

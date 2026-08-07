# Deploying Glaux Ledger

Two deployments: the API and Postgres on Railway, the frontend on Cloudflare Pages.

Order matters: the API has to exist before the frontend can be pointed at it, and the
frontend origin has to exist before CORS can be locked down. Expect to set
`CORS_ORIGINS` twice.

## What it costs, honestly

This is a product being sold. Budget **around $5–12 a month** before the first customer,
mostly Railway:

| | Plan | Why not the free one |
| --- | --- | --- |
| Railway | Hobby, $5/month minimum | The free plan is $1 of credit a month, one project, three services and no cron. An always-on API alone eats that; with Postgres beside it you are looking at $5 to $12 a month in practice, and the $5 subscription covers the first $5 of it. |
| Cloudflare Pages | Free is fine | Commercial use is allowed. Bandwidth and build minutes on Free cover this app; Workers Paid only becomes relevant if you graduate past static hosting. |

The frontend is a folder of static files.
[frontend/public/_redirects](../frontend/public/_redirects) and
[frontend/public/_headers](../frontend/public/_headers) are the Cloudflare Pages
equivalents of the SPA rewrite and cache rules; they copy into `dist` on build and
translate to a handful of lines of nginx or Caddy if you ever leave Pages.

At two shops the hosting costs more than one subscription. At ten it is a rounding error.
That is the shape of this business and it is better known now than later.

## 1. Backend and database on Railway

**Create the database.** New project → Add Postgres. Railway provisions it and exposes
`DATABASE_URL` as a reference variable.

**Deploy the API.** Add a service from your repo, set the root directory to `backend/`.
Railway detects [backend/Dockerfile](../backend/Dockerfile) via
[backend/railway.toml](../backend/railway.toml) and builds it. The container command runs
`alembic upgrade head` before starting uvicorn, so migrations apply on every release with
no separate step. The health check hits `/health`.

**Set the variables:**

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ADMIN_DATABASE_URL` | Optional owner-role URL for cross-tenant payment review. If omitted, falls back to `MIGRATION_DATABASE_URL`, then `DATABASE_URL`. |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ADMIN_JWT_EXPIRE_MINUTES` | Optional; defaults to 480 (8 hours), deliberately shorter than shop sessions |
| `CORS_ORIGINS` | Your Cloudflare Pages URL, no trailing slash. Set after step 2. |
| `ENVIRONMENT` | `production`, so error reports are labelled |
| `PARSER_PROVIDER` | `stub` to keep voice/photo capture hidden, or `openai` with a key to enable it |
| `OPENAI_API_KEY` | Only if `PARSER_PROVIDER=openai` |
| `AI_CALLS_PER_MONTH` | Defaults to 500 per shop. This is your OpenAI bill, on a route any signed-in shop can call in a loop. |
| `SENTRY_DSN` | Optional. Unset means nothing is reported anywhere. |

Railway hands out a bare `postgresql://…`, which SQLAlchemy would resolve to psycopg2,
not installed here. Settings rewrites that (and the legacy `postgres://`) to
`postgresql+psycopg://` on load, so the reference variable can be used as-is.

`JWT_SECRET` has no default and no fallback: a deploy without it fails at startup rather
than signing tokens with a key published in this repository. Under 32 bytes fails too, as
does the old development placeholder.

Sentry runs with `send_default_pii` off and it must stay off. With it on, request bodies
and headers go with the report, which here means amounts, supplier names and bearer
tokens sitting in a third-party dashboard.

Payment slips are stored privately in Postgres. The API validates their actual JPEG,
PNG, or PDF signatures, caps their size, and never exposes a public URL. This keeps them
inside the same RLS and backup boundary as the ledger. Budget for the added database and
dump size; do not move them to Railway's container filesystem, which does not survive a
replacement deployment.

Confirm with `curl https://your-api.up.railway.app/health` →
`{"status":"ok","database":"ok"}`. It answers 503 with `"degraded"` if the database is
unreachable, so the platform's health check restarts a service that cannot serve.

### RLS on a managed database

Railway gives you one role, and it owns the schema. Postgres ignores row-level security
for superusers and for anything with `BYPASSRLS`, so with a single role the RLS layer is
inert. The three application-level layers still apply, and those are what the test suite
proves.

To keep the database-level net, create a second role once, from the Railway Postgres
console:

```sql
CREATE ROLE glaux_app LOGIN PASSWORD 'generate-something-long'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE railway TO glaux_app;
GRANT USAGE ON SCHEMA public TO glaux_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO glaux_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glaux_app;
```

Then point `DATABASE_URL` at `glaux_app` and `MIGRATION_DATABASE_URL` at the owner role.
Set `ADMIN_DATABASE_URL` to that same owner-role URL. Cross-tenant payment review is the
only request path that uses it, and the privileged session is opened only after a
platform-user token has been verified.
Run it *after* the first deploy, so the tables exist for the `GRANT`; the
`ALTER DEFAULT PRIVILEGES` line covers every table created by later migrations.

### Bootstrap payment reviewers

There is no public administrator registration. After the first migration, create the
first platform user from a trusted checkout configured with the production owner URL:

```bash
cd backend
python platform_admin.py create owner@example.com --role admin
python platform_admin.py list
```

The command prompts for a password and rejects anything shorter than 12 characters.
Use `role`, `disable`, and `reset` for later access changes. The separate admin UI is at
`/admin/login`; shop tokens and platform tokens are intentionally not interchangeable.

## 2. Frontend on Cloudflare Pages

Create a Pages project from the repo (Workers & Pages → Create → Connect to Git), or
deploy manually with Wrangler after a local build.

**Dashboard settings:**

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 20 (or set `NODE_VERSION=20` in the environment) |

Set the variables, one required and the rest copy. In Pages these are **build** variables
(Vite inlines them at compile time):

```
VITE_API_BASE_URL=https://your-api.up.railway.app
VITE_PRICE_MONTHLY=LKR 1,500
VITE_SUPPORT_EMAIL=hello@glauxledger.lk
VITE_PAY_BANK=Commercial Bank
VITE_PAY_ACCOUNT_NAME=Glaux Software
VITE_PAY_ACCOUNT_NUMBER=8001234567
```

No trailing slash on the URL: paths are concatenated directly.

The billing values are what the landing page and the Settings payment flow show a shop
that wants to pay. Leave the bank details unset and it falls back to support contact
instead of shipping a placeholder account number. No payment gateway, webhook, or card
credential is required.

Vite inlines all of these at build time, not runtime, so **changing one requires a
redeploy**, not just a restart.

[frontend/public/_redirects](../frontend/public/_redirects) is the catch-all SPA rewrite
so client routes like `/dashboard` do not 404 on refresh.
[frontend/public/_headers](../frontend/public/_headers) sets `must-revalidate` on `sw.js`
because a cached service worker cannot ship its own replacement, and long immutable
caching for the hashed asset bundles.

**Manual deploy** (optional, same output as the dashboard build):

```bash
cd frontend
npm ci
npm run build
npx wrangler pages deploy dist --project-name=glaux-ledger
```

[frontend/wrangler.toml](../frontend/wrangler.toml) names the project and points at `dist`.

## 3. Close the CORS loop

Go back to Railway and set `CORS_ORIGINS` to the Cloudflare Pages origin:

```
CORS_ORIGINS=https://glaux-ledger.pages.dev
```

Comma-separate to allow more than one, and add a custom domain or preview URL if you use
those:

```
CORS_ORIGINS=https://glaux-ledger.pages.dev,https://ledger.example.com
```

Preview deployments get unique `*.pages.dev` hostnames. Either add each one you care
about, or skip preview CORS and only allow the production origin.

The list is an allowlist. `*` would not work here anyway, since the app sends
`Authorization` headers and credentialed requests cannot use a wildcard origin.

## Verifying the deployment

Start with the API, which is scripted:

```
python scripts/smoke.py https://glaux-ledger-api.up.railway.app
```

[backend/scripts/smoke.py](../backend/scripts/smoke.py) registers a shop over real HTTP
and drives it through a day's trading: the categories it was seeded with, a sale, a cost,
a supplier bill left unpaid, the totals those add up to, the PDF, signing back in, and
that a second shop can see none of it. It prints a line per check and exits non-zero if
any of them failed, so it can be a release step rather than a habit. It leaves the two
shops it made behind; delete them or leave them, they cost nothing.

That covers everything the browser is not needed for. The rest by hand:

1. Register a shop from the deployed frontend. If this fails with a network error and the
   browser console mentions CORS, `CORS_ORIGINS` does not match the origin exactly,
   scheme and subdomain included.
2. In Chrome DevTools → Application → Manifest, check "Installable" with no errors.
3. On an Android phone, open the site and look for "Install app" in the browser menu.
   iOS has no install prompt; use Share → Add to Home Screen.
4. Record one entry, then turn on airplane mode and reload. The dashboard should still
   render from the service worker cache.
5. Open `/privacy` and `/terms` directly, signed out. Both are client routes, so a 404
   here means the catch-all rewrite is not in place.
6. Submit a small test JPEG/PDF slip from Billing, sign into `/admin/login`, review it,
   and approve one month. Refresh the shop and verify its paid-through date changed.
7. Run `python platform_admin.py list` and `python mark_paid.py list` from a trusted
   checkout pointed at the production owner URL. Both operational recovery paths must be
   proven before launch.

## Backups

These are other people's financial records, several years of them, and often the only
copy. Whatever automated snapshots the host offers are a good first line and a bad only
line: they live in the same account as the database, so one billing lapse, one deleted
project or one compromised login loses both at once. Take your own, somewhere else.

[backend/backup.py](../backend/backup.py) does the taking, and checks each dump the moment
it is written, because a backup nobody has read is a guess:

```bash
cd backend
python backup.py dump --to /var/backups/glaux --keep 14
python backup.py list --to /var/backups/glaux
```

It shells out to `pg_dump`, so the Postgres client tools have to be installed and their
major version has to match the server's. Point `MIGRATION_DATABASE_URL` at the owner role,
which is what `dump` uses: a backup should not depend on whatever grants the runtime role
happens to hold.

**Run it daily, from somewhere that is not Railway.** A cron entry on any machine that can
reach the database is enough, and one that is not the host itself is the point:

```cron
15 2 * * *  cd /srv/glaux-ledger/backend && ./.venv/bin/python backup.py dump --to /var/backups/glaux --keep 14
```

Then copy the directory off that machine too: `rclone sync`, `rsync` to a second host, or
a nightly upload to object storage. Two copies in one building is one copy.

**Rehearse the restore.** Once a quarter, into a scratch database, because an untested
restore procedure is a plan and not a capability:

```bash
createdb glaux_rehearsal
python backup.py restore /var/backups/glaux/glaux-2026-08-03-0215.dump \
  --into postgresql://you@localhost/glaux_rehearsal
python -m alembic current   # against the scratch database
```

`restore` will not touch the configured database: the target is a required argument with
no default, and it asks before dropping anything.

**Before every migration**, take one by hand. `alembic downgrade` covers the schema and
nothing else: a migration that drops a column takes the data with it, and only a dump
brings it back.

## Operational notes

**Migrations run on every release.** Convenient, but two instances starting at once can
race. At one-shop scale this is fine. If you scale past one instance, move
`alembic upgrade head` into a Railway pre-deploy command instead of the container start.

**The access token lives 14 days** and is stored in `localStorage`, so a shop device is
not logged out mid-shift. The tradeoffs: it is readable by any XSS on the origin, and it
cannot be revoked before expiry. Shorten `JWT_EXPIRE_MINUTES` if that trade does not suit
you, or add refresh tokens (deliberately deferred; see the README).

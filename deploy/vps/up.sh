#!/usr/bin/env bash
# Bring up Glaux Ledger on a VPS. Run from this directory (deploy/vps).
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill it in." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

for var in API_DOMAIN JWT_SECRET POSTGRES_PASSWORD GLAUX_APP_PASSWORD CORS_ORIGINS; do
  if [[ -z "${!var:-}" ]]; then
    echo "Set $var in .env" >&2
    exit 1
  fi
done

chmod +x postgres/init/01-app-role.sh up.sh

docker compose pull caddy db || true
docker compose build api
docker compose up -d

echo
echo "Waiting for https://${API_DOMAIN}/health …"
for _ in $(seq 1 45); do
  if out="$(curl -fsS "https://${API_DOMAIN}/health" 2>/dev/null)"; then
    echo "$out"
    echo
    echo "API is up. Create an admin:"
    echo "  docker compose exec api python platform_admin.py create you@example.com --role admin"
    exit 0
  fi
  sleep 2
done

echo "Still starting (or DNS/TLS not ready). Check:" >&2
echo "  docker compose logs -f" >&2
exit 0

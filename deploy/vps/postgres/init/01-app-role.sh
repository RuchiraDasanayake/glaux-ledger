#!/bin/bash
# First-boot only: create the NOSUPERUSER role the API connects as.
set -euo pipefail

: "${POSTGRES_USER:?}"
: "${POSTGRES_DB:?}"
: "${GLAUX_APP_PASSWORD:?}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v app_password="$GLAUX_APP_PASSWORD" <<'EOSQL'
CREATE ROLE glaux_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE glaux_ledger TO glaux_app;
GRANT USAGE ON SCHEMA public TO glaux_app;

ALTER DEFAULT PRIVILEGES FOR ROLE glaux IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glaux_app;
ALTER DEFAULT PRIVILEGES FOR ROLE glaux IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO glaux_app;
EOSQL

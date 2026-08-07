-- Runs once, on first initialisation of the data volume.
--
-- Postgres silently ignores row-level security for superusers and for any role with
-- BYPASSRLS. POSTGRES_USER ("glaux") is a superuser, so if the API connected as that
-- role the RLS policies would be decorative. This creates the unprivileged role the
-- application actually connects as; Alembic keeps using the owner role for DDL.

CREATE ROLE glaux_app LOGIN PASSWORD 'glaux_dev_password'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE glaux_ledger TO glaux_app;
GRANT USAGE ON SCHEMA public TO glaux_app;

-- Tables do not exist yet. Alembic creates them later as "glaux". Default privileges
-- means those future tables are granted automatically, so no migration needs to
-- remember to issue a GRANT.
ALTER DEFAULT PRIVILEGES FOR ROLE glaux IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glaux_app;
ALTER DEFAULT PRIVILEGES FOR ROLE glaux IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO glaux_app;

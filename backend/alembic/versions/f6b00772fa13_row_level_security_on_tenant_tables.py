"""row level security on tenant tables

Defence in depth behind the application-level tenant filtering. If a query ever reaches
Postgres without its business_id predicate (a hand-written statement, a future route
that bypasses TenantRepository, or an injection), these policies still return nothing.

Notes on the details:

* FORCE is required as well as ENABLE. Without it the table owner (the role Alembic runs
  as) is exempt, and any deployment where the app shares that role would get no
  protection at all.
* The policy reads a session GUC set per transaction by app.db.session. current_setting
  is called with missing_ok=true so an unset GUC yields NULL, which fails the comparison
  and denies rather than leaks.
* users and businesses are deliberately excluded: login must look a user up by email
  before any business context exists. Those two are scoped in the application layer.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f6b00772fa13"
down_revision: str | Sequence[str] | None = "6f0adee8e5c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TENANT_TABLES = ("categories", "transactions")


def upgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_tenant_isolation ON {table}
            USING (
                business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
            )
            WITH CHECK (
                business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
            )
            """
        )


def downgrade() -> None:
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

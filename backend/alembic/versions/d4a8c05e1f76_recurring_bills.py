"""recurring bills

Rent and electricity are the same entry every month, retyped from memory. This adds a
template table and a link from the transactions it produces.

Two decisions worth recording:

* Templates, not a schedule. Nothing posts itself. An electricity bill is a different
  figure every month, so the app offers the entry on the due day and the shopkeeper
  confirms it, and a deployment with one container has nowhere to run a nightly job
  anyway.
* `transactions.recurring_id` rather than matching on category and month. "Have I
  already recorded the rent" has to be exact, and voiding the entry has to make the bill
  due again. ON DELETE SET NULL, so removing a template never touches the ledger.

The table is tenant-scoped, so it gets the same RLS policy as categories and
transactions rather than relying on the application filter alone.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d4a8c05e1f76"
down_revision: str | Sequence[str] | None = "c9d1f3a7b284"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recurring_bills",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "business_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("businesses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("counterparty", sa.Text(), nullable=True),
        sa.Column("payment_method", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("amount > 0", name="ck_recurring_amount_positive"),
        sa.CheckConstraint("day_of_month BETWEEN 1 AND 28", name="ck_recurring_day_of_month"),
        sa.CheckConstraint(
            "payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank', 'credit')",
            name="ck_recurring_payment_method",
        ),
    )
    op.create_index("ix_recurring_business_day", "recurring_bills", ["business_id", "day_of_month"])

    op.execute("ALTER TABLE recurring_bills ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE recurring_bills FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY recurring_bills_tenant_isolation ON recurring_bills
        USING (
            business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
        )
        WITH CHECK (
            business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
        )
        """
    )
    # No GRANT here: docker/postgres/init/01-app-role.sql sets default privileges for
    # the owner role, so tables a migration creates are granted to glaux_app already.

    op.add_column(
        "transactions",
        sa.Column(
            "recurring_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("recurring_bills.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # Answers "was this month's instance already recorded" for one bill at a time, and
    # only the live rows can answer it: a voided entry leaves the bill due.
    op.create_index(
        "ix_transactions_recurring",
        "transactions",
        ["recurring_id", "occurred_at"],
        postgresql_where=sa.text("recurring_id IS NOT NULL AND voided_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_recurring", table_name="transactions")
    op.drop_column("transactions", "recurring_id")
    op.execute("DROP POLICY IF EXISTS recurring_bills_tenant_isolation ON recurring_bills")
    op.drop_index("ix_recurring_business_day", table_name="recurring_bills")
    op.drop_table("recurring_bills")

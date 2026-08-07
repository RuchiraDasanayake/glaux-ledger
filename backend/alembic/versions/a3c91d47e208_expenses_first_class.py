"""expenses first class

Everything a retail shop needs to record a cost rather than just a sale.

Additive, and deliberately no new tables: the RLS policies from f6b00772fa13 are attached
to `transactions` and `categories` themselves, so new columns inherit tenant isolation
for free. A `suppliers` table would have needed its own policy and its own migration.

The one column worth explaining is `occurred_at`. Until now `created_at` served double
duty as both "when this was typed" and "when the money moved", which is fine for a sale
rung up at the counter and wrong for an electricity bill entered three days late. They
are separated here: `occurred_at` drives every filter, summary and report, `created_at`
stays as the untouched audit trail. Existing rows are backfilled from `created_at`, which
is exactly right: for entries made at the counter the two genuinely are the same
moment.

`settled_at` NULL means the money has not moved yet, which is how a credit purchase from
a supplier is recorded. Existing rows all backfill as settled, since there was no way to
record anything else.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a3c91d47e208"
down_revision: str | Sequence[str] | None = "f6b00772fa13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Added nullable, backfilled, then made NOT NULL. Adding it NOT NULL outright would
    # need a server_default of now(), which would quietly stamp every historical row with
    # the migration's own timestamp instead of the date it was recorded.
    op.add_column("transactions", sa.Column("occurred_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE transactions SET occurred_at = created_at WHERE occurred_at IS NULL")
    op.alter_column("transactions", "occurred_at", nullable=False)

    op.add_column("transactions", sa.Column("counterparty", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("payment_method", sa.Text(), nullable=True))
    op.add_column("transactions", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column(
        "transactions", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("transactions", sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True))

    # Nothing could be recorded as unpaid before this migration, so everything already in
    # the table has been settled. Using created_at rather than now() keeps a later
    # "settled on" display honest.
    op.execute("UPDATE transactions SET settled_at = created_at WHERE settled_at IS NULL")

    op.create_check_constraint(
        "ck_transactions_payment_method",
        "transactions",
        "payment_method IS NULL OR payment_method IN ('cash', 'card', 'bank', 'credit')",
    )

    # Reads now order by occurred_at, so the old index would no longer be scanned.
    op.create_index(
        "ix_transactions_business_occurred", "transactions", ["business_id", "occurred_at"]
    )
    op.drop_index("ix_transactions_business_created", table_name="transactions")

    # Partial: outstanding bills stay a handful of rows while the table grows without
    # bound, so indexing the settled majority would be dead weight.
    op.create_index(
        "ix_transactions_outstanding",
        "transactions",
        ["business_id", "due_date"],
        postgresql_where=sa.text("settled_at IS NULL AND voided_at IS NULL"),
    )

    op.add_column("categories", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "archived_at")

    op.drop_index("ix_transactions_outstanding", table_name="transactions")
    op.create_index(
        "ix_transactions_business_created", "transactions", ["business_id", "created_at"]
    )
    op.drop_index("ix_transactions_business_occurred", table_name="transactions")

    op.drop_constraint("ck_transactions_payment_method", "transactions", type_="check")

    for column in ("voided_at", "settled_at", "due_date", "payment_method", "counterparty"):
        op.drop_column("transactions", column)
    op.drop_column("transactions", "occurred_at")

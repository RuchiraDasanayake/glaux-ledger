"""ai usage counter

A monthly allowance for the voice and photo routes, which are the only two that spend
money at a third party. Two columns on `businesses` rather than a usage table: this is a
single integer per shop that is overwritten every month, and a new tenant-scoped table
would have needed its own RLS policy and its own repository to hold it.

The period is stored as the first of the month the count belongs to, so the reset is a
comparison rather than a scheduled job: a stale period simply means the count is zero.
Nothing has to run at midnight on the first, which is the kind of thing that fails
quietly for a month before anyone notices.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c9d1f3a7b284"
down_revision: str | Sequence[str] | None = "b7e42a1c9d30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("businesses", sa.Column("ai_period", sa.Date(), nullable=True))
    op.add_column(
        "businesses",
        sa.Column("ai_calls_used", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("businesses", "ai_calls_used")
    op.drop_column("businesses", "ai_period")

"""subscription trial and paid through

Two columns on `businesses`, which is the tenant table itself and so carries no RLS policy
of its own: a business is reached only through the signed token, never through a query
another tenant could issue.

There is deliberately no `status` column. Status is a function of these two dates and is
computed on read (`Business.status`). A stored copy would be a third source of truth that
something has to keep in step (a cron, a login hook, a webhook) and the day that
something fails is the day a paying shop is locked out or a lapsed one writes for free.

Existing rows get a full trial from the moment of the migration rather than from their
original signup. Backdating from `created_at` would be more literal but would lock out
every shop that registered more than thirty days ago the instant this deploys, which is a
rude way to introduce a paywall to people who were promised nothing of the sort.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7e42a1c9d30"
down_revision: str | Sequence[str] | None = "a3c91d47e208"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Added nullable, filled, then made NOT NULL, so the fill can be an expression rather
    # than one frozen server_default stamped on every row.
    op.add_column("businesses", sa.Column("trial_ends_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE businesses SET trial_ends_at = now() + interval '30 days'")
    op.alter_column("businesses", "trial_ends_at", nullable=False)

    op.add_column("businesses", sa.Column("paid_through", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("businesses", "paid_through")
    op.drop_column("businesses", "trial_ends_at")

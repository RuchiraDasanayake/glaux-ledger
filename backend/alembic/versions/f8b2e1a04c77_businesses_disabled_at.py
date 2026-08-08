"""add businesses.disabled_at for admin suspend"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f8b2e1a04c77"
down_revision: str | Sequence[str] | None = "e2a4c8d91f30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "businesses",
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("businesses", "disabled_at")

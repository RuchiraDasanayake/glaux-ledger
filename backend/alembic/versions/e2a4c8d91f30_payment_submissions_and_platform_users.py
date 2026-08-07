"""payment submissions and platform administrators"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "e2a4c8d91f30"
down_revision: str | Sequence[str] | None = "d4a8c05e1f76"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "platform_users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('admin', 'reviewer')", name="ck_platform_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    op.create_table(
        "payment_submissions",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("business_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("transfer_date", sa.Date(), nullable=False),
        sa.Column("transfer_reference", sa.Text(), nullable=True),
        sa.Column("evidence_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("evidence_mime", sa.Text(), nullable=False),
        sa.Column("evidence_size", sa.Integer(), nullable=False),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("amount > 0", name="ck_payment_submissions_amount_positive"),
        sa.CheckConstraint(
            "evidence_size > 0", name="ck_payment_submissions_evidence_size_positive"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_payment_submissions_status",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["platform_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_payment_submissions_business_created",
        "payment_submissions",
        ["business_id", "created_at"],
    )
    op.create_index(
        "ix_payment_submissions_status_created",
        "payment_submissions",
        ["status", "created_at"],
    )

    op.execute("ALTER TABLE payment_submissions ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE payment_submissions FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY payment_submissions_tenant_isolation ON payment_submissions
        USING (
            business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
        )
        WITH CHECK (
            business_id = NULLIF(current_setting('app.business_id', true), '')::uuid
        )
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP POLICY IF EXISTS payment_submissions_tenant_isolation ON payment_submissions"
    )
    op.drop_index("ix_payment_submissions_status_created", table_name="payment_submissions")
    op.drop_index("ix_payment_submissions_business_created", table_name="payment_submissions")
    op.drop_table("payment_submissions")
    op.drop_table("platform_users")

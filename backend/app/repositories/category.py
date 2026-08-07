from collections.abc import Sequence
from typing import Annotated

from fastapi import Depends
from sqlalchemy import func, select

from app.core.deps import CurrentBusinessId, TenantSession
from app.models import Category, Transaction
from app.repositories.base import TenantRepository


class CategoryRepository(TenantRepository[Category]):
    model = Category

    def list_ordered(self, *, include_archived: bool = False) -> Sequence[Category]:
        # Income first, then alphabetical: the shop records far more sales than costs,
        # so the common choices land at the top of the picker.
        stmt = self.select()
        if not include_archived:
            stmt = stmt.where(Category.archived_at.is_(None))
        return (
            self.session.scalars(stmt.order_by(Category.type.desc(), Category.name)).unique().all()
        )

    def name_exists(self, name: str, *, excluding: Category | None = None) -> bool:
        """Archived names count: the unique constraint does not care that one is retired."""
        stmt = self.select().where(Category.name == name)
        if excluding is not None:
            stmt = stmt.where(Category.id != excluding.id)
        return self.session.scalars(stmt).first() is not None

    def usage_count(self, category: Category) -> int:
        """How many entries are filed here, so the UI can warn before retiring one."""
        return (
            self.session.scalar(
                select(func.count())
                .select_from(Transaction)
                .where(
                    Transaction.business_id == self.business_id,
                    Transaction.category_id == category.id,
                    Transaction.voided_at.is_(None),
                )
            )
            or 0
        )


def get_category_repo(session: TenantSession, business_id: CurrentBusinessId) -> CategoryRepository:
    return CategoryRepository(session, business_id)


CategoryRepo = Annotated[CategoryRepository, Depends(get_category_repo)]

import uuid
from collections.abc import Sequence

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db.base import Base, TenantScoped


class TenantRepository[ModelT: Base]:
    """Data access for one business, and only one business.

    Every read goes through :meth:`select`, which appends the ``business_id`` predicate
    itself. Callers therefore cannot construct an unfiltered query through this class,
    and :meth:`add` stamps the tenant rather than trusting the caller to set it.

    Two guards make misuse loud instead of silent:

    * the model must inherit :class:`~app.db.base.TenantScoped`, checked here at
      construction time;
    * routes only ever receive an instance built from the JWT-derived business id,
      because the DI providers in ``app.core.deps`` are the sole constructors.
    """

    model: type[ModelT]

    def __init__(self, session: Session, business_id: uuid.UUID) -> None:
        if not issubclass(self.model, TenantScoped):
            raise TypeError(
                f"{self.model.__name__} is not TenantScoped, so it cannot be served by a "
                "TenantRepository. Add the mixin or use the session directly and justify it."
            )
        self.session = session
        self.business_id = business_id

    def select(self) -> Select[tuple[ModelT]]:
        """The only entry point for building a query. Always tenant-filtered."""
        return select(self.model).where(self.model.business_id == self.business_id)

    def list(self) -> Sequence[ModelT]:
        return self.session.scalars(self.select()).unique().all()

    def get(self, entity_id: uuid.UUID) -> ModelT | None:
        """Scoped by id *and* business, so another tenant's id simply looks absent."""
        return (
            self.session.scalars(self.select().where(self.model.id == entity_id))
            .unique()
            .one_or_none()
        )

    def count(self) -> int:
        return self.session.scalar(
            select(func.count())
            .select_from(self.model)
            .where(self.model.business_id == self.business_id)
        )

    def add(self, **fields) -> ModelT:
        """Create a row for this tenant.

        A ``business_id`` passed in by a caller is rejected outright rather than
        overwritten, so an attempt to write across tenants fails loudly in tests.
        """
        if "business_id" in fields:
            raise TypeError(
                "business_id is derived from the authenticated token and must not be passed in"
            )
        instance = self.model(business_id=self.business_id, **fields)
        self.session.add(instance)
        self.session.flush()
        return instance

    def delete(self, instance: ModelT) -> None:
        if instance.business_id != self.business_id:
            raise PermissionError("Refusing to delete a row belonging to another business")
        self.session.delete(instance)
        self.session.flush()

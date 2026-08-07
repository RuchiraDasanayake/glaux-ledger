from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)

TENANT_SESSION_KEY = "business_id"


@event.listens_for(Session, "after_begin")
def _apply_tenant_guc(session: Session, transaction, connection) -> None:
    """Re-stamp ``app.business_id`` at the start of every transaction on the session.

    The RLS policies read this GUC. Setting it once per request would not survive an
    intermediate commit, since ``set_config(..., is_local => true)`` is scoped to the
    transaction. Hooking ``after_begin`` means every new transaction re-applies it.
    """
    business_id = session.info.get(TENANT_SESSION_KEY)
    if business_id is None:
        return
    connection.exec_driver_sql(
        "SELECT set_config('app.business_id', %s, true)", (str(business_id),)
    )


def bind_tenant(session: Session, business_id) -> None:
    """Attach a business to the session and apply the GUC to the live transaction."""
    session.info[TENANT_SESSION_KEY] = business_id
    session.execute(
        text("SELECT set_config('app.business_id', :bid, true)"), {"bid": str(business_id)}
    )


def get_db() -> Generator[Session, None, None]:
    """Request-scoped session.

    Commits are issued explicitly by the routes rather than here: teardown of a
    ``yield`` dependency runs after the response has been produced, so a failure at
    that point could not be reported to the client.
    """
    session = SessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

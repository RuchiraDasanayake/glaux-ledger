"""Verifies the Postgres safety net independently of the application's own filtering.

These queries deliberately omit any business_id predicate. If RLS is working, the
database returns nothing anyway.
"""

import pytest
from sqlalchemy import create_engine, text

import app.models  # noqa: F401  (registers every mapper before the registry is read)
from app.db.base import Base, TenantScoped
from tests.conftest import APP_URL, OWNER_URL, Tenant


@pytest.fixture(scope="module")
def app_engine():
    engine = create_engine(APP_URL)
    yield engine
    engine.dispose()


def test_the_app_role_cannot_bypass_row_security(app_engine) -> None:
    """If this fails, every other test in this file is meaningless."""
    with app_engine.connect() as conn:
        row = conn.execute(
            text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
        ).one()
    assert row.rolsuper is False, "app role is a superuser; RLS would be ignored"
    assert row.rolbypassrls is False, "app role has BYPASSRLS; RLS would be ignored"


def test_unscoped_select_returns_nothing(alpha: Tenant, beta: Tenant, app_engine) -> None:
    alpha.add_transaction("Printing", "100.00")
    beta.add_transaction("Printing", "200.00")

    with app_engine.connect() as conn:
        # No GUC set, no WHERE clause: the policy denies everything.
        count = conn.execute(text("SELECT count(*) FROM transactions")).scalar()
    assert count == 0


def test_scoped_select_sees_only_that_business(alpha: Tenant, beta: Tenant, app_engine) -> None:
    alpha.add_transaction("Printing", "100.00")
    beta.add_transaction("Printing", "200.00")
    beta.add_transaction("Scanning", "300.00")

    with app_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.business_id', :bid, false)"),
            {"bid": alpha.business_id},
        )
        rows = conn.execute(text("SELECT amount FROM transactions")).scalars().all()

    assert [str(amount) for amount in rows] == ["100.00"]


def test_insert_for_another_business_is_blocked(alpha: Tenant, beta: Tenant, app_engine) -> None:
    """WITH CHECK stops a write that the SELECT policy would later hide."""
    category_id = beta.category_id("Printing")

    with app_engine.connect() as conn:
        conn.execute(
            text("SELECT set_config('app.business_id', :bid, false)"),
            {"bid": alpha.business_id},
        )
        with pytest.raises(Exception, match="row-level security"):
            conn.execute(
                text(
                    "INSERT INTO transactions (business_id, category_id, amount, entry_type) "
                    "VALUES (:bid, :cid, 1.00, 'income')"
                ),
                {"bid": beta.business_id, "cid": category_id},
            )


def test_policies_are_forced_so_the_owner_is_not_exempt() -> None:
    """Derived from the models, not a hand-kept list.

    `users` is the one deliberate exemption: login has to find a user by email before
    any business context exists, so it is scoped in the application layer instead. Every
    other tenant table is expected here, which is what makes adding one without a policy
    a failing test rather than a silent hole.
    """
    expected = {
        mapper.class_.__tablename__
        for mapper in Base.registry.mappers
        if issubclass(mapper.class_, TenantScoped)
    } - {"users"}

    owner = create_engine(OWNER_URL)
    with owner.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class "
                "WHERE relname = ANY(:tables)"
            ),
            {"tables": sorted(expected)},
        ).all()
    owner.dispose()

    assert {row.relname for row in rows} == expected
    for row in rows:
        assert row.relrowsecurity, f"{row.relname} does not have RLS enabled"
        assert row.relforcerowsecurity, f"{row.relname} does not FORCE RLS for its owner"

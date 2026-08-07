"""Structural guard: a new route cannot quietly skip tenant scoping.

Reviewing every future endpoint by eye does not scale. This walks the dependency tree
FastAPI actually resolves at request time, so a route that forgets to depend on the
tenant machinery fails here instead of leaking in production.
"""

from collections.abc import Iterator

from fastapi import APIRouter, FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute

from app.core.deps import (
    get_current_business_id,
    get_current_platform_user,
    require_active_subscription,
)
from app.main import app

WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}

# Routes that legitimately run without a business context. Adding to this set is a
# deliberate, reviewable act, which is the point.
PUBLIC_PATHS = {
    "/health",
    "/auth/register",
    "/auth/login",
    "/admin/auth/login",
    "/openapi.json",
    "/docs",
    "/docs/oauth2-redirect",
    "/redoc",
}

SUBSCRIPTION_EXEMPT_WRITES = {"/billing/payment-submissions"}


def _all_dependencies(dependant: Dependant) -> Iterator[Dependant]:
    yield dependant
    for sub_dependant in dependant.dependencies:
        yield from _all_dependencies(sub_dependant)


def _iter_api_routes(router) -> Iterator[APIRoute]:
    """Every APIRoute reachable from a router.

    FastAPI 0.141 keeps included routers nested behind an ``_IncludedRouter`` wrapper
    rather than flattening them into ``app.routes``, so this has to recurse. It also
    handles the older flat layout, which costs nothing.
    """
    for route in getattr(router, "routes", []):
        if isinstance(route, APIRoute):
            yield route
        nested = getattr(route, "original_router", None)
        if nested is not None:
            yield from _iter_api_routes(nested)


def _protected_routes() -> list[APIRoute]:
    return [route for route in _iter_api_routes(app.router) if route.path not in PUBLIC_PATHS]


def _shop_routes() -> list[APIRoute]:
    return [route for route in _protected_routes() if not route.path.startswith("/admin/")]


def _admin_routes() -> list[APIRoute]:
    return [
        route
        for route in _protected_routes()
        if route.path.startswith("/admin/")
    ]


def test_there_are_protected_routes_to_check() -> None:
    # Guards the guard: a refactor that empties the route list must not make this
    # suite silently vacuous.
    assert len(_protected_routes()) >= 4


def test_every_protected_route_derives_its_business_from_the_token() -> None:
    offenders = []
    for route in _shop_routes():
        resolved = {dep.call for dep in _all_dependencies(route.dependant)}
        if get_current_business_id not in resolved:
            offenders.append(f"{sorted(route.methods)} {route.path}")

    assert not offenders, (
        "These routes never resolve get_current_business_id, so nothing scopes them to a "
        "business:\n  " + "\n  ".join(offenders)
    )


def test_every_admin_route_uses_platform_authentication() -> None:
    offenders = []
    for route in _admin_routes():
        resolved = {dep.call for dep in _all_dependencies(route.dependant)}
        if get_current_platform_user not in resolved:
            offenders.append(f"{sorted(route.methods)} {route.path}")
    assert not offenders, "Admin routes missing platform authentication:\n  " + "\n  ".join(
        offenders
    )


def test_every_write_route_is_behind_the_subscription_gate() -> None:
    offenders = [
        f"{sorted(route.methods)} {route.path}"
        for route in _shop_routes()
        if route.methods & WRITE_METHODS
        and route.path not in SUBSCRIPTION_EXEMPT_WRITES
        and require_active_subscription not in {d.call for d in _all_dependencies(route.dependant)}
    ]
    assert not offenders, (
        "These routes mutate data or spend money but do not check the subscription, so a "
        "lapsed shop can still reach them:\n  " + "\n  ".join(offenders)
    )


def test_no_read_route_is_behind_the_subscription_gate() -> None:
    """The half of the rule that is easy to break by accident.

    Locking a shop out of its own books over an unpaid invoice is the one thing the
    billing layer must never do, and it would take exactly one careless `dependencies=`
    on a GET to do it.
    """
    offenders = [
        f"{sorted(route.methods)} {route.path}"
        for route in _iter_api_routes(app.router)
        if not route.methods & WRITE_METHODS
        and require_active_subscription in {d.call for d in _all_dependencies(route.dependant)}
    ]
    assert not offenders, (
        "These routes only read, but a lapsed shop is refused them. Its own records and "
        "exports must stay reachable forever:\n  " + "\n  ".join(offenders)
    )


def test_the_guard_would_catch_an_unscoped_route() -> None:
    """Proves the detection works, rather than passing because it finds nothing."""
    rogue_router = APIRouter()

    @rogue_router.get("/rogue")
    def rogue_endpoint() -> dict:
        return {}

    probe = FastAPI()
    probe.include_router(rogue_router)

    rogue_routes = [r for r in _iter_api_routes(probe.router) if r.path == "/rogue"]
    assert rogue_routes, "the walker failed to discover the probe route"

    resolved = {dep.call for dep in _all_dependencies(rogue_routes[0].dependant)}
    assert get_current_business_id not in resolved

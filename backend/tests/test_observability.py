"""The 500 path, the request id, and a health check that means something.

None of this is reachable in normal use, which is exactly why it needs tests: the first
time the global handler runs will be in production, on a real fault, in front of a real
shopkeeper.
"""

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.observability import JsonFormatter, install, request_id_var
from app.main import app


def _probe_client() -> TestClient:
    """A throwaway app with the same handlers and one route that fails.

    Adding the failing route to the real `app` would be simpler and wrong: it is a
    module-level singleton shared by every test in the suite, and a route that skips
    tenant scoping is exactly what test_route_guard exists to catch.

    raise_server_exceptions=False makes TestClient behave like a deployment, where the
    exception becomes a response instead of being re-raised into the caller.
    """
    probe = FastAPI()
    install(probe)

    @probe.get("/boom")
    def _explode() -> dict:
        raise RuntimeError("a secret table name and a stack trace")

    return TestClient(probe, raise_server_exceptions=False)


def test_the_real_app_installs_the_handler() -> None:
    """The probe below proves the handler works; this proves it is actually wired in."""
    assert Exception in app.exception_handlers


def test_an_unhandled_error_returns_a_clean_500() -> None:
    response = _probe_client().get("/boom")

    assert response.status_code == 500
    body = response.json()
    assert body["detail"] == "Something went wrong at our end. Nothing was saved."
    assert "a secret table name" not in response.text
    assert "Traceback" not in response.text


def test_the_failure_carries_an_id_that_is_also_in_the_header() -> None:
    """So a support message quoting one line is enough to find the exception."""
    response = _probe_client().get("/boom")
    assert response.json()["request_id"] == response.headers["X-Request-ID"]


def test_every_response_gets_a_request_id(client: TestClient) -> None:
    assert client.get("/health").headers["X-Request-ID"]


def test_the_headers_the_browser_needs_survive_a_cross_origin_call() -> None:
    """A cross-origin response hands JavaScript almost nothing unless it is named here.

    This cannot fail in development, where the Vite proxy makes every call same-origin,
    so it fails for the first time in production and silently: the header is on the wire,
    the browser refuses to hand it over, and the code reading it sees null. X-Request-ID
    is what a shopkeeper quotes in a support message and Retry-After is how a refusal
    says when to come back rather than "in a moment".
    """
    exposed = {
        header.strip()
        for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
        for header in middleware.kwargs["expose_headers"]
    }
    assert {"X-Request-ID", "Retry-After"} <= exposed


def test_an_id_supplied_by_the_edge_is_kept(client: TestClient) -> None:
    """A trace should span the proxy and the app rather than restarting at our door."""
    response = client.get("/health", headers={"X-Request-ID": "edge-abc-123"})
    assert response.headers["X-Request-ID"] == "edge-abc-123"


def test_a_supplied_id_cannot_be_arbitrarily_long(client: TestClient) -> None:
    """It ends up in every log line for the request; it does not get to be a megabyte."""
    response = client.get("/health", headers={"X-Request-ID": "x" * 5000})
    assert len(response.headers["X-Request-ID"]) <= 64


def test_health_reports_the_database(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "database": "ok"}


def test_health_fails_when_the_database_is_unreachable(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It used to return ok unconditionally, which is worse than having no check: the
    platform keeps routing traffic to an instance that cannot answer any of it."""
    from app import main

    def refuse() -> None:
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    monkeypatch.setattr(main.engine, "connect", refuse)

    response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unreachable"}


def test_log_lines_are_json_carrying_the_request_id() -> None:
    token = request_id_var.set("req-xyz")
    record = logging.LogRecord("glaux", logging.INFO, __file__, 1, "request", None, None)
    record.status = 200
    record.route = "/transactions"

    line = json.loads(JsonFormatter().format(record))
    request_id_var.reset(token)

    assert line["request_id"] == "req-xyz"
    assert line["status"] == 200
    assert line["route"] == "/transactions"
    assert line["message"] == "request"


def test_nothing_in_a_log_line_carries_the_body() -> None:
    """Every value in this system is somebody's takings. The log records the shape of a
    request (who, which route, what outcome) and never its contents."""
    token = request_id_var.set("req-xyz")
    record = logging.LogRecord("glaux", logging.INFO, __file__, 1, "request", None, None)
    record.method = "POST"
    record.route = "/transactions"
    record.status = 201

    line = json.loads(JsonFormatter().format(record))
    request_id_var.reset(token)

    assert set(line) == {
        "ts",
        "level",
        "logger",
        "message",
        "request_id",
        "method",
        "route",
        "status",
    }

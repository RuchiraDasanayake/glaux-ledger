"""Logging, request ids and error reporting.

Three things that only matter once someone else is using this. Until then an exception is
a stack trace in the terminal you are already looking at; afterwards it is a shopkeeper
saying "it did not work" about a request you have no way to find.

The privacy note is the important one. Every field in this system is somebody's takings,
so nothing here logs a request body, a query string, or a response, and Sentry is
configured the same way. What is recorded is the shape of a request: who, what route,
which outcome. That is enough to find a fault and not enough to reconstruct a ledger.
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.core.config import settings

# Carried through the whole request without threading a parameter into everything that
# might log. Read by the formatter, the error handler, and the response header.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
business_id_var: ContextVar[str] = ContextVar("business_id", default="-")

logger = logging.getLogger("glaux")

# Set by the logging config below; anything the application's own code attaches shows up
# alongside these rather than being swallowed.
_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__) | {
    "message",
    "asctime",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    """One JSON object per line, because these are read by a machine first.

    Railway, Better Stack and the like parse JSON lines into filterable fields. A
    human-readable format looks better in a terminal and is useless the moment the
    question is "show me every 500 from this shop last Tuesday".
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        business = business_id_var.get()
        if business != "-":
            payload["business_id"] = business
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        payload.update({k: v for k, v in record.__dict__.items() if k not in _RESERVED})
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())

    # Uvicorn's own access line carries no request id and no shop, and would double every
    # entry the middleware below already writes.
    logging.getLogger("uvicorn.access").handlers = []
    logging.getLogger("uvicorn.access").propagate = False
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True


def init_sentry() -> None:
    """No-op unless SENTRY_DSN is set, so local and test runs report nothing."""
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
    except ModuleNotFoundError:  # pragma: no cover - only when the extra is not installed
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed")
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Off, and it must stay off. With PII on, Sentry attaches request bodies and
        # headers, which here means amounts, notes, supplier names and bearer tokens
        # sitting in a third-party dashboard.
        send_default_pii=False,
    )


def install(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_context(request: Request, call_next):
        # An id supplied by the edge is preferred, so a trace spans the proxy and the app
        # rather than restarting here.
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming[:64] if incoming else uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        business_token = business_id_var.set("-")
        started = time.perf_counter()

        try:
            response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 1)

        # The path template, not the path: /transactions/{id} aggregates, while a
        # thousand distinct uuids do not.
        route = request.scope.get("route")
        logger.info(
            "request",
            extra={
                "method": request.method,
                "route": getattr(route, "path", request.url.path),
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        response.headers["X-Request-ID"] = request_id
        request_id_var.reset(token)
        business_id_var.reset(business_token)
        return response

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception) -> JSONResponse:
        """A clean 500 instead of a stack trace on the wire.

        Starlette's default handler re-raises, which in production means the traceback
        is rendered into the response body: table names, file paths, and whatever
        local variable was being interpolated at the time.

        The request id goes back with it so a support message quoting one line is enough
        to find the exception in the logs.
        """
        request_id = request_id_var.get()
        logger.exception(
            "unhandled exception",
            extra={"method": request.method, "route": request.url.path},
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "detail": "Something went wrong at our end. Nothing was saved.",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )

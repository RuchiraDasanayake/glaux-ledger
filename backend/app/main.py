from fastapi import FastAPI, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.router import api_router
from app.core.config import settings
from app.core.observability import configure_logging, init_sentry, install, logger
from app.db.session import engine

configure_logging()
init_sentry()

app = FastAPI(
    title="Glaux Ledger API",
    version="0.1.0",
    description="Bookkeeping for small shops. Every business's data is isolated by business_id.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # A cross-origin response hands the browser only a handful of headers unless they are
    # named here. X-Request-ID so a failure can be shown to the shopkeeper and quoted in a
    # support message; Retry-After so a refusal can say how long rather than "a moment",
    # which is the difference between waiting and assuming the product is broken. Both are
    # invisible in development, where the Vite proxy makes everything same-origin.
    expose_headers=["X-Request-ID", "Retry-After"],
)

install(app)
app.include_router(api_router)


@app.get("/health", tags=["meta"])
def health(response: Response) -> dict[str, str]:
    """Liveness plus the one dependency that matters.

    This used to return ok unconditionally, which made it worse than having none: a
    platform health check would report a service with an unreachable database as
    perfectly well and keep sending it traffic.

    Deliberately not authenticated and deliberately vague: an unauthenticated caller
    learns that something is wrong, never what.
    """
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("health check could not reach the database")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", "database": "unreachable"}

    return {"status": "ok", "database": "ok"}

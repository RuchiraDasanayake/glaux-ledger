FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

FROM base AS deps
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM base AS runtime
COPY --from=deps /install /usr/local
COPY . .
RUN useradd --system --uid 1001 appuser && chown -R appuser /app
USER appuser
EXPOSE 8000

# Migrations run as the owner role via MIGRATION_DATABASE_URL when the runtime role is
# unprivileged; hosts that give you a single owning role can just set DATABASE_URL.
#
# --forwarded-allow-ips="*" is what makes the rate limiter see the caller rather than the
# platform's proxy, which would otherwise put every request on the planet in one bucket.
# It is only safe because nothing reaches this container except through that proxy; on a
# host where the port is directly reachable, X-Forwarded-For becomes caller-controlled
# and this must be narrowed to the proxy's address.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]

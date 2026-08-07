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

# Migrations use MIGRATION_DATABASE_URL (owner) when the runtime role is unprivileged.
# FORWARDED_ALLOW_IPS must stay limited to the reverse proxy (Caddy/Railway edge).
# Only use * when port 8000 is not published on the host.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips=${FORWARDED_ALLOW_IPS:-*}"]

import uuid
from collections.abc import Generator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.observability import business_id_var
from app.core.security import (
    AdminTokenClaims,
    InvalidToken,
    TokenClaims,
    decode_access_token,
    decode_admin_access_token,
)
from app.db.session import bind_tenant, get_db
from app.models import Business, PlatformUser, SubscriptionStatus, User

bearer_scheme = HTTPBearer(auto_error=False, description="JWT issued by /auth/login")

_UNAUTHORISED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

_PAYMENT_REQUIRED = HTTPException(
    status_code=status.HTTP_402_PAYMENT_REQUIRED,
    detail=(
        "This shop's subscription has ended. Your records are still here. "
        "You can read and export everything. Renew to record new entries."
    ),
)


def get_token_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenClaims:
    if credentials is None:
        raise _UNAUTHORISED
    try:
        return decode_access_token(credentials.credentials)
    except InvalidToken as exc:
        raise _UNAUTHORISED from exc


def get_current_business_id(
    claims: Annotated[TokenClaims, Depends(get_token_claims)],
) -> uuid.UUID:
    """The single source of truth for which business a request may touch.

    Deliberately derived only from the signed token. No route reads a business id from
    a path, query string or body.
    """
    # Stamped onto the log context here because this is the first point in a request
    # where the tenant is known, and it is the field every support question starts from.
    business_id_var.set(str(claims.business_id))
    return claims.business_id


CurrentBusinessId = Annotated[uuid.UUID, Depends(get_current_business_id)]


def get_tenant_db(
    session: Annotated[Session, Depends(get_db)], business_id: CurrentBusinessId
) -> Session:
    """Session with the tenant bound, for both the ORM filters and the RLS policies."""
    bind_tenant(session, business_id)
    return session


TenantSession = Annotated[Session, Depends(get_tenant_db)]


def get_admin_token_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AdminTokenClaims:
    if credentials is None:
        raise _UNAUTHORISED
    try:
        return decode_admin_access_token(credentials.credentials)
    except InvalidToken as exc:
        raise _UNAUTHORISED from exc


def get_current_platform_user(
    claims: Annotated[AdminTokenClaims, Depends(get_admin_token_claims)],
    session: Annotated[Session, Depends(get_db)],
) -> PlatformUser:
    user = session.get(PlatformUser, claims.user_id)
    if user is None or user.disabled_at is not None:
        raise _UNAUTHORISED
    return user


CurrentPlatformUser = Annotated[PlatformUser, Depends(get_current_platform_user)]

_privileged_engine = create_engine(settings.privileged_url, pool_pre_ping=True, future=True)
_PrivilegedSessionLocal = sessionmaker(
    bind=_privileged_engine, autoflush=False, expire_on_commit=False, future=True
)


def get_privileged_db(
    _user: CurrentPlatformUser,
) -> Generator[Session, None, None]:
    """Open the cross-tenant connection only after platform role authentication."""
    session = _PrivilegedSessionLocal()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


PrivilegedSession = Annotated[Session, Depends(get_privileged_db)]


def get_current_user(
    claims: Annotated[TokenClaims, Depends(get_token_claims)], session: TenantSession
) -> User:
    user = session.get(User, claims.user_id)
    if user is None or user.business_id != claims.business_id:
        raise _UNAUTHORISED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_business(session: TenantSession, business_id: CurrentBusinessId) -> Business:
    """The tenant row itself, needed wherever timezone or currency matters."""
    business = session.get(Business, business_id)
    if business is None:
        raise _UNAUTHORISED
    return business


CurrentBusiness = Annotated[Business, Depends(get_current_business)]


def require_active_subscription(business: CurrentBusiness) -> None:
    """Gate for writes only. Never attach this to a read or to the export.

    A lapsed shop loses the ability to record new entries, never the ability to reach the
    ones it already has. These are the business's own accounts, in many cases ones it is
    legally required to keep and produce, and putting them behind an unpaid invoice is not
    a pricing tactic, and a shop that cannot get its records out is a shop that will not
    come back.
    """
    if business.status is SubscriptionStatus.lapsed:
        raise _PAYMENT_REQUIRED


# A bare marker rather than an Annotated type: nothing needs the return value, so route
# handlers take it via `dependencies=[...]` and keep their signatures free of a parameter
# that would otherwise be unused in every single one of them.
RequireActive = Depends(require_active_subscription)


# One statement, so two uploads arriving together cannot both read the same count and
# both be allowed. The WHERE clause is the limit: when it fails no row comes back and
# nothing is incremented, so the stored figure never climbs past the cap and stays
# meaningful to display.
_CONSUME_AI_CALL = text(
    """
    UPDATE businesses
       SET ai_period = :period,
           ai_calls_used = CASE WHEN ai_period = :period THEN ai_calls_used + 1 ELSE 1 END
     WHERE id = :business_id
       AND (ai_period IS DISTINCT FROM :period OR ai_calls_used < :cap)
    RETURNING ai_calls_used
    """
)


def consume_ai_call(session: TenantSession, business: CurrentBusiness) -> None:
    """Spend one of this month's voice-or-photo allowances, or refuse.

    Counted per upload rather than per API call, even though one upload is two calls to
    OpenAI: transcribe or OCR, then extract. The shopkeeper's unit is "I photographed a
    bill", and a limit expressed in anything else cannot be explained to them.
    """
    used = session.scalar(
        _CONSUME_AI_CALL,
        {
            "period": business.local_today.replace(day=1),
            "business_id": business.id,
            "cap": settings.ai_calls_per_month,
        },
    )
    if used is None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You have used this month's {settings.ai_calls_per_month} voice and photo "
                "entries. Typing one in still works, and the allowance resets on the 1st."
            ),
        )
    # Committed immediately and on its own: the parse that follows can take thirty
    # seconds or fail outright, and either way the attempt has already cost money.
    session.commit()


RequireAiAllowance = Depends(consume_ai_call)

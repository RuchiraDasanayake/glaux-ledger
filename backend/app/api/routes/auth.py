from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.errors import UniqueViolation
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import CurrentBusiness, CurrentUser
from app.core.limiter import (
    failed_login_guard,
    login_rate_limit,
    record_failed_login,
    register_rate_limit,
)
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import bind_tenant, get_db
from app.models import Business, User
from app.schemas.auth import BusinessOut, LoginRequest, MeOut, RegisterRequest, TokenResponse
from app.services.seed import seed_default_categories

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(user: User, business: Business) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id=user.id, business_id=business.id),
        expires_in=settings.jwt_expire_minutes * 60,
        business=BusinessOut.model_validate(business),
    )


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(register_rate_limit)],
)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Create a business, its first user, and a starter set of categories atomically."""
    email = payload.email.lower()

    business = Business(
        name=payload.business_name.strip(),
        owner_email=email,
        timezone=payload.timezone,
        currency=payload.currency.upper(),
    )
    db.add(business)
    try:
        # Populates the server-generated UUID so the rows below can reference it.
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_failure(exc) from exc

    # categories is under RLS, so the GUC has to be set before those inserts. It could
    # not be set earlier: the business id did not exist until the flush above.
    bind_tenant(db, business.id)

    db.add(
        User(
            business_id=business.id,
            email=email,
            hashed_password=hash_password(payload.password),
        )
    )
    seed_default_categories(db, business.id)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise _integrity_failure(exc) from exc

    db.refresh(business)
    user = db.scalar(select(User).where(User.email == email))
    return _token_response(user, business)


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(login_rate_limit)])
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    # In the body rather than in `dependencies`, because the address limit above it takes
    # only the request while this one needs the email out of the parsed payload.
    failed_login_guard(payload.email)

    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    # verify_password hashes a dummy value when the user is missing, so the response
    # time does not reveal whether the email is registered.
    if not verify_password(payload.password, user.hashed_password if user else None):
        # Counted whether or not the email belongs to anyone, so the limit cannot be used
        # to find out which addresses are registered.
        record_failed_login(payload.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )

    business = db.get(Business, user.business_id)
    return _token_response(user, business)


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, business: CurrentBusiness) -> MeOut:
    """Lets the frontend restore a session from a stored token without re-login."""
    return MeOut(user_id=user.id, email=user.email, business=BusinessOut.model_validate(business))


def _integrity_failure(exc: IntegrityError) -> Exception:
    """A duplicate email is the only integrity error a caller can do anything about.

    Reporting every one of them as a taken email is worse than useless: a missing column
    default or a broken constraint then presents as a 409 telling a first-time visitor to
    sign in instead, and nothing reaches the error tracker. Anything else is re-raised as
    the server fault it is.
    """
    if isinstance(exc.orig, UniqueViolation):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    return exc

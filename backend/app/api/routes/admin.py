import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import CurrentPlatformUser, PrivilegedSession
from app.core.limiter import (
    failed_login_guard,
    login_rate_limit,
    record_failed_login,
)
from app.core.security import create_admin_access_token, verify_password
from app.db.session import get_db
from app.models import (
    Business,
    PaymentSubmission,
    PaymentSubmissionStatus,
    PlatformUser,
    SubscriptionStatus,
)
from app.schemas.admin import (
    AdminLoginRequest,
    AdminOverviewOut,
    AdminShopOut,
    AdminTokenResponse,
    ExtendShopRequest,
)
from app.schemas.payment_submission import (
    AdminPaymentSubmissionOut,
    ApprovalRequest,
    PaymentReviewOut,
    PaymentSubmissionOut,
    RejectionRequest,
)
from app.services.billing import extend_paid_through

router = APIRouter(prefix="/admin", tags=["admin"])

_EVIDENCE_SUFFIX = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
_PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
}


@router.post(
    "/auth/login",
    response_model=AdminTokenResponse,
    dependencies=[Depends(login_rate_limit)],
)
def admin_login(
    payload: AdminLoginRequest, db: Annotated[Session, Depends(get_db)]
) -> AdminTokenResponse:
    email = payload.email.lower()
    failed_login_guard(f"platform:{email}")
    user = db.scalar(select(PlatformUser).where(PlatformUser.email == email))
    valid = user is not None and user.disabled_at is None
    if not verify_password(payload.password, user.hashed_password if valid else None):
        record_failed_login(f"platform:{email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password"
        )
    return AdminTokenResponse(
        access_token=create_admin_access_token(user_id=user.id),
        expires_in=settings.admin_jwt_expire_minutes * 60,
        user_id=user.id,
        email=user.email,
        role=user.role,
    )


@router.get("/overview", response_model=AdminOverviewOut)
def admin_overview(db: PrivilegedSession, _user: CurrentPlatformUser) -> AdminOverviewOut:
    shops = list(db.scalars(select(Business)))
    counts = {status: 0 for status in SubscriptionStatus}
    suspended = 0
    for shop in shops:
        if shop.disabled_at is not None:
            suspended += 1
        else:
            counts[shop.status] += 1

    pending = db.scalar(
        select(func.count())
        .select_from(PaymentSubmission)
        .where(PaymentSubmission.status == PaymentSubmissionStatus.pending.value)
    )
    week_ago = datetime.now(UTC) - timedelta(days=7)
    joined = db.scalar(
        select(func.count()).select_from(Business).where(Business.created_at >= week_ago)
    )
    return AdminOverviewOut(
        shops_total=len(shops),
        shops_trialing=counts[SubscriptionStatus.trialing],
        shops_active=counts[SubscriptionStatus.active],
        shops_lapsed=counts[SubscriptionStatus.lapsed],
        shops_suspended=suspended,
        pending_payments=int(pending or 0),
        shops_joined_7d=int(joined or 0),
    )


@router.get("/shops", response_model=list[AdminShopOut])
def list_shops(
    db: PrivilegedSession,
    _user: CurrentPlatformUser,
    shop_status: Annotated[SubscriptionStatus | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=120)] = None,
    suspended: Annotated[bool | None, Query()] = None,
) -> list[AdminShopOut]:
    statement = select(Business).order_by(Business.created_at.desc())
    needle = (q or "").strip()
    if needle:
        pattern = f"%{needle}%"
        statement = statement.where(
            or_(Business.name.ilike(pattern), Business.owner_email.ilike(pattern))
        )
    shops = list(db.scalars(statement))
    out: list[AdminShopOut] = []
    for shop in shops:
        is_suspended = shop.disabled_at is not None
        if suspended is True and not is_suspended:
            continue
        if suspended is False and is_suspended:
            continue
        if shop_status is not None and (is_suspended or shop.status is not shop_status):
            continue
        out.append(_shop_out(shop))
    return out


@router.get("/shops/{shop_id}", response_model=AdminShopOut)
def get_shop(
    shop_id: uuid.UUID, db: PrivilegedSession, _user: CurrentPlatformUser
) -> AdminShopOut:
    shop = db.get(Business, shop_id)
    if shop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")
    return _shop_out(shop)


@router.post("/shops/{shop_id}/extend", response_model=AdminShopOut)
def extend_shop(
    shop_id: uuid.UUID,
    payload: ExtendShopRequest,
    db: PrivilegedSession,
    _user: CurrentPlatformUser,
) -> AdminShopOut:
    shop = db.scalar(select(Business).where(Business.id == shop_id).with_for_update())
    if shop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")
    shop.paid_through = extend_paid_through(shop, payload.months)
    if shop.disabled_at is not None:
        shop.disabled_at = None
    db.commit()
    db.refresh(shop)
    return _shop_out(shop)


@router.post("/shops/{shop_id}/suspend", response_model=AdminShopOut)
def suspend_shop(
    shop_id: uuid.UUID, db: PrivilegedSession, _user: CurrentPlatformUser
) -> AdminShopOut:
    shop = db.scalar(select(Business).where(Business.id == shop_id).with_for_update())
    if shop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")
    if shop.disabled_at is None:
        shop.disabled_at = datetime.now(UTC)
        db.commit()
        db.refresh(shop)
    return _shop_out(shop)


@router.post("/shops/{shop_id}/unsuspend", response_model=AdminShopOut)
def unsuspend_shop(
    shop_id: uuid.UUID, db: PrivilegedSession, _user: CurrentPlatformUser
) -> AdminShopOut:
    shop = db.scalar(select(Business).where(Business.id == shop_id).with_for_update())
    if shop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shop not found")
    if shop.disabled_at is not None:
        shop.disabled_at = None
        db.commit()
        db.refresh(shop)
    return _shop_out(shop)


@router.get("/payment-submissions", response_model=list[AdminPaymentSubmissionOut])
def list_all_payment_submissions(
    db: PrivilegedSession,
    _user: CurrentPlatformUser,
    submission_status: Annotated[PaymentSubmissionStatus | None, Query(alias="status")] = None,
) -> list[AdminPaymentSubmissionOut]:
    statement = (
        select(PaymentSubmission, Business)
        .join(Business, Business.id == PaymentSubmission.business_id)
        .order_by(PaymentSubmission.created_at.desc())
    )
    if submission_status is not None:
        statement = statement.where(PaymentSubmission.status == submission_status.value)
    return [_admin_out(item, business) for item, business in db.execute(statement)]


@router.get("/payment-submissions/{submission_id}/evidence")
def get_admin_payment_evidence(
    submission_id: uuid.UUID,
    db: PrivilegedSession,
    _user: CurrentPlatformUser,
) -> Response:
    submission = db.get(PaymentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return Response(
        content=submission.evidence_bytes,
        media_type=submission.evidence_mime,
        headers={
            "Content-Disposition": (
                f'inline; filename="{submission.id}{_EVIDENCE_SUFFIX[submission.evidence_mime]}"'
            ),
            **_PRIVATE_HEADERS,
        },
    )


@router.post(
    "/payment-submissions/{submission_id}/approve",
    response_model=PaymentReviewOut,
)
def approve_payment_submission(
    submission_id: uuid.UUID,
    payload: ApprovalRequest,
    db: PrivilegedSession,
    user: CurrentPlatformUser,
) -> PaymentReviewOut:
    submission = db.scalar(
        select(PaymentSubmission)
        .where(PaymentSubmission.id == submission_id)
        .with_for_update()
    )
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    business = db.scalar(
        select(Business).where(Business.id == submission.business_id).with_for_update()
    )
    if business is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if submission.status == PaymentSubmissionStatus.rejected.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A rejected submission cannot be approved",
        )
    if submission.status == PaymentSubmissionStatus.pending.value:
        business.paid_through = extend_paid_through(business, payload.months)
        if business.disabled_at is not None:
            business.disabled_at = None
        submission.status = PaymentSubmissionStatus.approved.value
        submission.reviewed_by = user.id
        submission.reviewed_at = datetime.now(UTC)
        submission.review_note = (payload.note or "").strip() or None
        db.commit()
        db.refresh(submission)
        db.refresh(business)

    return _review_out(submission, business)


@router.post(
    "/payment-submissions/{submission_id}/reject",
    response_model=PaymentReviewOut,
)
def reject_payment_submission(
    submission_id: uuid.UUID,
    payload: RejectionRequest,
    db: PrivilegedSession,
    user: CurrentPlatformUser,
) -> PaymentReviewOut:
    submission = db.scalar(
        select(PaymentSubmission)
        .where(PaymentSubmission.id == submission_id)
        .with_for_update()
    )
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    business = db.get(Business, submission.business_id)
    if submission.status == PaymentSubmissionStatus.approved.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An approved submission cannot be rejected",
        )
    if submission.status == PaymentSubmissionStatus.pending.value:
        submission.status = PaymentSubmissionStatus.rejected.value
        submission.reviewed_by = user.id
        submission.reviewed_at = datetime.now(UTC)
        submission.review_note = payload.note.strip()
        db.commit()
        db.refresh(submission)
    return _review_out(submission, business)


def _shop_out(shop: Business) -> AdminShopOut:
    return AdminShopOut(
        id=shop.id,
        name=shop.name,
        owner_email=shop.owner_email,
        timezone=shop.timezone,
        currency=shop.currency,
        status=shop.status,
        trial_ends_at=shop.trial_ends_at,
        trial_days_left=shop.trial_days_left,
        paid_through=shop.paid_through,
        disabled_at=shop.disabled_at,
        created_at=shop.created_at,
    )


def _admin_out(
    submission: PaymentSubmission, business: Business
) -> AdminPaymentSubmissionOut:
    return AdminPaymentSubmissionOut(
        **PaymentSubmissionOut.model_validate(submission).model_dump(),
        business_id=submission.business_id,
        business_name=business.name,
        owner_email=business.owner_email,
        reviewed_by=submission.reviewed_by,
    )


def _review_out(submission: PaymentSubmission, business: Business) -> PaymentReviewOut:
    return PaymentReviewOut(
        **_admin_out(submission, business).model_dump(),
        paid_through=business.paid_through,
    )

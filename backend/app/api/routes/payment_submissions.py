import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from app.core.config import settings
from app.core.deps import CurrentBusiness
from app.core.limiter import payment_submission_rate_limit
from app.repositories.payment_submission import PaymentSubmissionRepository
from app.schemas.payment_submission import PaymentSubmissionOut

router = APIRouter(prefix="/billing/payment-submissions", tags=["billing"])

_EVIDENCE_SUFFIX = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
_PRIVATE_HEADERS = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
}


@router.post(
    "",
    response_model=PaymentSubmissionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(payment_submission_rate_limit)],
)
def create_payment_submission(
    submissions: PaymentSubmissionRepository,
    business: CurrentBusiness,
    amount: Annotated[Decimal, Form(gt=0, max_digits=12, decimal_places=2)],
    transfer_date: Annotated[date, Form()],
    transfer_reference: Annotated[str | None, Form(max_length=200)] = None,
    evidence: Annotated[UploadFile | None, File()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> PaymentSubmissionOut:
    if transfer_date > business.local_today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Transfer date cannot be in the future",
        )
    upload = evidence or file
    if upload is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="An evidence file is required",
        )
    payload = upload.file.read(settings.payment_evidence_max_bytes + 1)
    if len(payload) > settings.payment_evidence_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Evidence is larger than {settings.payment_evidence_max_bytes // 1_048_576} MB",
        )
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The evidence file was empty"
        )

    mime = _detect_evidence_mime(payload)
    if mime is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Evidence must be an actual JPEG, PNG, or PDF file",
        )

    submission = submissions.add(
        status="pending",
        amount=amount,
        transfer_date=transfer_date,
        transfer_reference=(transfer_reference or "").strip() or None,
        evidence_bytes=payload,
        evidence_mime=mime,
        evidence_size=len(payload),
    )
    submissions.session.commit()
    submissions.session.refresh(submission)
    return PaymentSubmissionOut.model_validate(submission)


@router.get("", response_model=list[PaymentSubmissionOut])
def list_payment_submissions(
    submissions: PaymentSubmissionRepository,
) -> list[PaymentSubmissionOut]:
    return [PaymentSubmissionOut.model_validate(item) for item in submissions.list_newest()]


@router.get("/{submission_id}/evidence")
def get_payment_evidence(
    submission_id: uuid.UUID,
    submissions: PaymentSubmissionRepository,
) -> Response:
    submission = submissions.get(submission_id)
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


def _detect_evidence_mime(payload: bytes) -> str | None:
    if payload.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if payload.startswith(b"%PDF-"):
        return "application/pdf"
    return None

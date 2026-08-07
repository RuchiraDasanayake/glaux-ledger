import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import PaymentSubmissionStatus


class PaymentSubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: PaymentSubmissionStatus
    amount: Decimal
    transfer_date: date
    transfer_reference: str | None
    evidence_mime: str
    evidence_size: int
    created_at: datetime
    reviewed_at: datetime | None
    review_note: str | None


class AdminPaymentSubmissionOut(PaymentSubmissionOut):
    business_id: uuid.UUID
    business_name: str
    owner_email: str
    reviewed_by: uuid.UUID | None


class ApprovalRequest(BaseModel):
    months: int = Field(default=1, ge=1, le=24)
    note: str | None = Field(default=None, max_length=1000)


class RejectionRequest(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


class PaymentReviewOut(AdminPaymentSubmissionOut):
    paid_through: date | None

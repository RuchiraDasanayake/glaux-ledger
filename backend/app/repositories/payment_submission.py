from typing import Annotated

from fastapi import Depends
from sqlalchemy import desc

from app.core.deps import CurrentBusinessId, TenantSession
from app.models import PaymentSubmission
from app.repositories.base import TenantRepository


class PaymentSubmissionRepo(TenantRepository[PaymentSubmission]):
    model = PaymentSubmission

    def list_newest(self) -> list[PaymentSubmission]:
        statement = self.select().order_by(desc(PaymentSubmission.created_at))
        return list(self.session.scalars(statement))


def get_payment_submission_repo(
    session: TenantSession, business_id: CurrentBusinessId
) -> PaymentSubmissionRepo:
    return PaymentSubmissionRepo(session, business_id)


PaymentSubmissionRepository = Annotated[
    PaymentSubmissionRepo, Depends(get_payment_submission_repo)
]

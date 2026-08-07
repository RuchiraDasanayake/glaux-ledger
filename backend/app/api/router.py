from fastapi import APIRouter

from app.api.routes import (
    admin,
    auth,
    capabilities,
    categories,
    payment_submissions,
    recurring,
    reports,
    transactions,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(capabilities.router)
api_router.include_router(payment_submissions.router)
api_router.include_router(categories.router)
api_router.include_router(transactions.router)
api_router.include_router(recurring.router)
api_router.include_router(reports.router)

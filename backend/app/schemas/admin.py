import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import PlatformRole, SubscriptionStatus


class AdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user_id: uuid.UUID
    email: str
    role: PlatformRole


class AdminOverviewOut(BaseModel):
    shops_total: int
    shops_trialing: int
    shops_active: int
    shops_lapsed: int
    shops_suspended: int
    pending_payments: int
    shops_joined_7d: int


class AdminShopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    owner_email: str
    timezone: str
    currency: str
    status: SubscriptionStatus
    trial_ends_at: datetime
    trial_days_left: int
    paid_through: date | None
    disabled_at: datetime | None
    created_at: datetime


class ExtendShopRequest(BaseModel):
    months: int = Field(default=1, ge=1, le=24)

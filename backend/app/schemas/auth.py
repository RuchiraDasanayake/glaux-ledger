import uuid
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import SubscriptionStatus


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    timezone: str
    currency: str

    # Sent on every session restore, so the shell can warn about an ending trial without
    # a second request. status is computed on the model, not stored; see Business.
    status: SubscriptionStatus
    trial_ends_at: datetime
    trial_days_left: int
    paid_through: date | None


class RegisterRequest(BaseModel):
    business_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: str = "Asia/Colombo"
    currency: str = Field(default="LKR", min_length=3, max_length=3)

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        # Every "today" boundary in the app is computed in this zone, so reject a bad
        # one at registration rather than producing silently wrong daily totals.
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"Unknown IANA timezone: {value!r}") from exc
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    business: BusinessOut


class MeOut(BaseModel):
    user_id: uuid.UUID
    email: str
    business: BusinessOut
